# Authentication Calcification Audit — `calcified-cognito`

**Date:** 2026-07-08
**Vendor profile(s) used:** `amplify-cognito.md` (last verified 2026-06-17)
**Model used (self-reported):** Claude Opus 4.8
**Mode:** non-interactive
**Skill version:** 1.3.0
**Machine-readable record:** [auth-calcification-audit.json](auth-calcification-audit.json)

## Summary

This app uses **AWS Amplify v6 (Amazon Cognito)** and is **heavily calcified**: there is no real auth boundary, and the vendor's shape leaks across all four change axes. The one file that looks like a seam — [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts) — is a *leaky facade*: it re-exports Amplify's functions and hands back the vendor's `AuthSession` unchanged, so callers are coupled to the vendor's types anyway. The two things that matter most: that facade earns no credit as a boundary, and the **ID token** (not the access token) is what authorizes outbound API calls — so both a provider swap and an authorization-model change are cross-cutting rewrites today.

## What auth calcification means (for this codebase)

Auth calcification is the degree to which a change that *should* be local — swap token storage, change refresh, replace the identity provider, move from inline claim reads to a real authorization model — has instead become a cross-cutting rewrite because the vendor's types and behaviors leaked everywhere. This codebase sits at the heavily-calcified end: Amplify's `AuthSession` / `AuthUser` / `FetchUserAttributesOutput` are the return and state types in component and page code, `cognito:*` claims are read inline in two components, `fetchUserAttributes` is called straight from a page, and there is no boundary module localizing any of it. Any of the four future changes below would touch every one of those call sites rather than a single adapter.

## Coverage

What was analyzed and how — so "no finding" never reads as "clean." This is a small app; **every source file was read in full** (comprehensive), so confidence is high and nothing was sampled or skipped.

- **Comprehensively read** (every relevant region opened):
  - [package.json](package.json) — vendor detection (identified `aws-amplify` v6).
  - [src/lib/amplify-config.ts](src/lib/amplify-config.ts) — configuration file and the token-storage seam the profile names as load-bearing.
  - [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts) — the only candidate boundary/wrapper module.
  - [src/api/client.ts](src/api/client.ts) — outbound API auth layer (refresh, token type, injection).
  - [src/components/UserBadge.tsx](src/components/UserBadge.tsx), [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx) — app-layer components.
  - [src/pages/Profile.tsx](src/pages/Profile.tsx) — page-level provider-specific usage.
  - [__tests__/auth.test.ts](__tests__/auth.test.ts) — the only auth test.
- **Sampled via grep + confirm:** none — the app is small enough to read exhaustively.
- **Not analyzed or low-confidence:** none. No unparseable files, dynamic imports, generated code, or vendors without a profile were encountered.

## Boundary assessment

The structural finding that frames everything else. A weak boundary is exactly why the axes below are expensive.

- **Anti-corruption layer — ABSENT.** Vendor `AuthSession` / `AuthUser` / `FetchUserAttributesOutput` cross into component state, page state, and exported return types. The "wrapper" at [src/lib/auth-helpers.ts:8](src/lib/auth-helpers.ts#L8) returns `Promise<AuthSession>` and [src/lib/auth-helpers.ts:14](src/lib/auth-helpers.ts#L14) returns `Promise<AuthUser>` — a leaky facade, the worst trap because it looks bounded. The leak recurs in app code: [src/components/UserBadge.tsx:11](src/components/UserBadge.tsx#L11) types state as `AuthSession`, [src/components/UserBadge.tsx:33](src/components/UserBadge.tsx#L33) exports `Promise<AuthSession>`, and [src/pages/Profile.tsx:12](src/pages/Profile.tsx#L12) types state as `FetchUserAttributesOutput`.
- **Injected vs imported — ABSENT.** Auth is imported directly from `aws-amplify/auth` and used inline at each call site; there is no injected `AuthPort`. See [src/api/client.ts:7](src/api/client.ts#L7) / [src/api/client.ts:14](src/api/client.ts#L14) and [src/components/AdminPanel.tsx:7](src/components/AdminPanel.tsx#L7).
- **Contract-tested — ABSENT.** No conformance suite tests the boundary independently of the vendor. The only auth test *mocks* `aws-amplify/auth` and asserts on the vendor's shape — [__tests__/auth.test.ts:9](__tests__/auth.test.ts#L9) and [__tests__/auth.test.ts:28](__tests__/auth.test.ts#L28) — which passes today and dies on migration.
- **Client/server split absorbed — NOT APPLICABLE.** This is a client-only React SPA; there is no SSR/server auth surface (no `aws-amplify/auth/server`, no `@aws-amplify/adapter-nextjs`/`createServerRunner`, no `Amplify.configure(..., { ssr: true })`, no execution-context branching), so the split does not arise.

Because there is no boundary and no contract suite, every axis change below has no single place to be made — that is the source of the cost.

## Findings by axis

For each axis: the observation, the evidence, and the recommended seam. **Cost evidence** is the skill's own mechanical read (qualitative, no durations). **Likelihood** is the maintainer's and was **not** supplied — this was a non-interactive run — so every axis is routed to *Judgment calls for you*.

### Token storage
- **Observation:** Vendor default — Amplify **v6**, no `setKeyValueStorage` and no custom `tokenProvider`, so tokens live in the default browser `localStorage`. (Searched for the v6 custom-adapter and built-in-selector patterns and the v5 `cookieStorage:`/`storage:` config patterns; none present.)
- **Evidence:** [src/lib/amplify-config.ts:5](src/lib/amplify-config.ts#L5) — `Amplify.configure` passes only the Cognito user-pool block; no storage configuration anywhere.
- **Recommended seam:** Plug a custom class implementing `KeyValueStorageInterface` into `cognitoUserPoolsTokenProvider.setKeyValueStorage`, behind an auth boundary, so where tokens live becomes one adapter's decision. (Note: this overrides the TokenStore only; `identityId` stays in `localStorage` if Identity Pools are used.)
- **Cost evidence:** **moderate** — storage is unconfigured and there is no boundary or storage seam to plug an adapter into, so the retrofit is *introducing* the seam plus config; contained, but the JS-readable-token dependency ties it to the refresh path.
- **Likelihood:** see *Judgment calls for you*.

### Refresh and owned runtime behaviors
- **Observation:** Inherited vendor magic — a bare `fetchAuthSession()` in the axios request interceptor, with no single-flight dedup and no explicit `onSessionExpired` failure path.
- **Evidence:** [src/api/client.ts:14](src/api/client.ts#L14) — `const session = await fetchAuthSession();` inside the request interceptor.
- **Recommended seam:** Own refresh at the API-client seam: a 401 interceptor with single-flight dedup (N concurrent 401s trigger one refresh) and an explicit `onSessionExpired` failure path, rather than relying on Amplify's silent auto-refresh. Amplify's silent refresh works only because tokens are JS-readable — it breaks the day storage moves to HttpOnly cookies.
- **Cost evidence:** **moderate** — one bare call site to own, but with no boundary present, adding single-flight and a failure path means introducing the seam, not filling an existing `onRefresh` slot.
- **Likelihood:** see *Judgment calls for you*.

### Identity provider
- **Observation:** Scattered — Cognito-specific surface (`cognito:groups`, `cognito:username`, `custom:` attributes, `fetchUserAttributes`) is read across three app-layer files with nothing localizing it.
- **Evidence:** [src/components/UserBadge.tsx:18](src/components/UserBadge.tsx#L18) and [src/components/AdminPanel.tsx:15](src/components/AdminPanel.tsx#L15) read `cognito:groups`; [src/pages/Profile.tsx:15](src/pages/Profile.tsx#L15) calls `fetchUserAttributes` and [src/pages/Profile.tsx:19](src/pages/Profile.tsx#L19) reads a `custom:tenantId` attribute.
- **Recommended seam:** Localize Cognito-specific surface (groups, custom attributes, `fetchUserAttributes`) inside a single adapter; the rest of the app speaks a domain `Principal` and OIDC/OAuth2 vocabulary, not `cognito:*`.
- **Cost evidence:** **high** — Cognito-specific surface is read inline across three files with nothing localizing it; a provider swap touches every one of these call sites.
- **Likelihood:** see *Judgment calls for you*.

### Authorization (and token type)
- **Observation:** Inline claim/role reads and ID-token-for-API. Authorization decisions read `idToken.payload['cognito:groups']` inline with hard-coded role strings in two components, and the **ID token** (not the access token) authorizes outbound API calls.
- **Evidence:** inline reads at [src/components/UserBadge.tsx:22](src/components/UserBadge.tsx#L22) (`groups.includes("admin")`) and [src/components/AdminPanel.tsx:17](src/components/AdminPanel.tsx#L17) (`"admin" || "billing-admin"`); the ID token is attached at [src/api/client.ts:15](src/api/client.ts#L15) and [src/api/client.ts:17](src/api/client.ts#L17).
- **Recommended seam:** Map claims to a domain `Principal` at the boundary and route authorization through a policy layer instead of inline `cognito:groups` reads; attach the **access token** (not the ID token) as the API `Authorization` header so identity and authorization decouple.
- **Cost evidence:** **high** — inline claim reads with hard-coded role strings in two components, plus the ID token authorizing the API; a move to a policy layer plus access tokens has no single place to change.
- **Likelihood:** see *Judgment calls for you*.

## Migration-readiness

Not applicable — the migration-readiness view reports progress toward a change the *maintainer* flagged, and this was a non-interactive run with no change flagged. Re-run interactively to get this framing.

## Prioritized backlog

Not produced. Prioritization ranks the audit's cost evidence against the maintainer's **likelihood of change**, and this was a non-interactive run — no likelihood input exists to rank by. The findings and recommended seams above stand on their own; ranking them requires the maintainer's answers to the questions below. (See non-negotiable #1: the skill will not invent the human axes.)

## Judgment calls for you

The questions the audit deliberately did not answer, because only the maintainer can. In a non-interactive run, all four axis questions route here.

- **Token storage.** Is a token-storage change actually on the table — e.g. a move to HttpOnly cookies, an encrypted store, or session cookies? A change here is also what breaks Amplify's silent refresh. (Findings: storage default at [src/lib/amplify-config.ts:5](src/lib/amplify-config.ts#L5).)
- **Refresh.** Is owning refresh (401-interceptor + single-flight + explicit `onSessionExpired`) on the roadmap? Refresh changes are usually downstream of a storage move. (Finding: [src/api/client.ts:14](src/api/client.ts#L14).)
- **Identity provider.** Is a provider swap away from Cognito realistically on the table, and how much Cognito-specific behavior are you willing to keep? Both are roadmap and appetite calls. (Findings: [src/components/UserBadge.tsx:18](src/components/UserBadge.tsx#L18), [src/pages/Profile.tsx:15](src/pages/Profile.tsx#L15).)
- **Authorization.** Are authorization-model changes planned (RBAC/ABAC or finer permissions), or a move from the ID token to the access token for API authorization? What backend contracts depend on the current ID-token choice is not visible in this code. (Findings: [src/components/UserBadge.tsx:22](src/components/UserBadge.tsx#L22), [src/api/client.ts:15](src/api/client.ts#L15).)
- **True retrofit cost (all axes).** What is the real call-site count as the app grows, the current test coverage, and the team bandwidth? The audit supplies mechanical cost evidence; time-to-complete is your number.

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** It assesses changeability, not vulnerabilities. It's worth noting in passing that tokens in the default browser `localStorage` are the storage posture referenced above — but that is a *changeability* observation here; get a real security review for anything vulnerability-related, which this deliberately does not cover.
- App↔auth boundary only; infrastructure, gateways, and IaC were out of scope.
- Findings are evidence-backed observations; no prioritization is presented because no maintainer inputs were supplied (non-interactive run).
- **Cost figures are qualitative (low/moderate/high) and based on mechanical evidence.** Real time-to-complete depends on test coverage, team bandwidth, and the per-app call-site reality you know best — confirm before committing to sequencing.
