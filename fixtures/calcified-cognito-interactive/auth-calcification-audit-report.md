# Authentication Calcification Audit — `fixture-calcified-cognito`

**Date:** 2026-07-09
**Vendor profile(s) used:** `amplify-cognito.md` (last verified 2026-06-17)
**Model used (self-reported):** claude-opus-4-7
**Mode:** interactive
**Skill version:** 1.4.0
**Machine-readable record:** [auth-calcification-audit.json](auth-calcification-audit.json)

> **Judgment inputs came from a pre-filled `_interview.yaml` file at the repo root, not a live conversation with the maintainer.** The likelihood values below are the file's answers normalized to the skill's fixed mapping; the maintainer's raw text is preserved in the JSON under `interview.answers`.

## Summary

Amplify v6 (`aws-amplify ^6.6.0`) targeting Amazon Cognito, wired straight into a client-only React SPA. The auth boundary is **absent across all four structural signals** — no `AuthPort`, five app-layer files import `aws-amplify/auth` directly, the "wrapper" in [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts) is a leaky facade returning the vendor's `AuthSession` unchanged, and the only auth test mocks the vendor. Two of the changes already on the roadmap collide with what the code does today (see the Headline below).

## What auth calcification means (for this codebase)

Auth calcification is the degree to which a change that should be local — swap token storage, change refresh, replace the identity provider, move from inline claim reads to a real authorization model — has instead become a cross-cutting rewrite because the vendor's types and behaviors leaked everywhere. **This codebase is heavily calcified.** `AuthSession` and `FetchUserAttributesOutput` are React state and return types in app-layer files; `cognito:groups` is read inline in two components with hard-coded role strings; the API interceptor attaches the ID token; and Amplify's silent refresh is doing all the refresh work without any owned single-flight or failure path. Each of the four planned or possible changes below would touch several files and introduce machinery that doesn't exist yet.

## Coverage

- **Comprehensively read** (every relevant region opened):
  - [src/lib/amplify-config.ts](src/lib/amplify-config.ts) — Amplify configuration entry point (load-bearing for the storage seam).
  - [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts) — candidate boundary module; needed to distinguish real anti-corruption layer from leaky facade.
  - [src/api/client.ts](src/api/client.ts) — auth-consuming integration point (refresh, token-type, injected-vs-imported all surface here).
  - [src/components/UserBadge.tsx](src/components/UserBadge.tsx) — confirmed vendor-type leak, inline claim reads, hard-coded roles.
  - [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx) — second component, needed to establish spread of inline reads.
  - [src/pages/Profile.tsx](src/pages/Profile.tsx) — vendor-specific `fetchUserAttributes` and custom-attribute surface.
  - [__tests__/auth.test.ts](__tests__/auth.test.ts) — the only auth test; classified as vendor-shape mocking.
- **Sampled via grep + confirm:** none — the fixture is small enough that every source file was read in full.
- **Not analyzed or low-confidence:** none. This is a small, statically-imported client-only SPA with no dynamic imports, no generated code, and no unparseable files.

## Boundary assessment

The structural finding that frames everything else — the boundary is what determines cost on the four axes below. **Verdict: absent across the three signals that apply here; the fourth (client/server split) does not arise.**

- **Anti-corruption layer** — **absent.** Vendor types cross into app-layer signatures: `AuthSession` used as React state in [src/components/UserBadge.tsx:11](src/components/UserBadge.tsx#L11), returned from [src/components/UserBadge.tsx:33](src/components/UserBadge.tsx#L33), and returned by the "wrapper" at [src/lib/auth-helpers.ts:8](src/lib/auth-helpers.ts#L8); `AuthUser` returned at [src/lib/auth-helpers.ts:14](src/lib/auth-helpers.ts#L14); `FetchUserAttributesOutput` imported into a page at [src/pages/Profile.tsx:8](src/pages/Profile.tsx#L8). The `lib/auth-helpers.ts` file **looks like** a boundary and isn't — it is the exact leaky-facade shape the methodology warns about.
- **Injected vs imported** — **absent.** `aws-amplify/auth` is imported at module level in five app-layer files: [src/components/UserBadge.tsx:8](src/components/UserBadge.tsx#L8), [src/components/AdminPanel.tsx:7](src/components/AdminPanel.tsx#L7), [src/api/client.ts:7](src/api/client.ts#L7), [src/pages/Profile.tsx:7](src/pages/Profile.tsx#L7), and [src/lib/auth-helpers.ts:6](src/lib/auth-helpers.ts#L6). No `AuthPort` / `AuthAdapter` interface exists; nothing receives auth as an injected capability.
- **Contract-tested** — **absent.** The only auth test mocks the vendor and asserts on its `idToken.payload['cognito:groups']` shape at [__tests__/auth.test.ts:9](__tests__/auth.test.ts#L9) and [__tests__/auth.test.ts:28](__tests__/auth.test.ts#L28). It will pass today and die on migration — the exact anti-pattern a contract suite would replace.
- **Client/server split absorbed** — **not applicable.** This is a client-only React SPA. No `aws-amplify/auth/server` imports, no `createServerRunner`, no `typeof window` branching, no `@aws-amplify/adapter-nextjs`. The concern does not arise here; recording it as "absent" would be a false gap.

A boundary this weak is the reason cost evidence sits at moderate/high on every axis below — every downstream change has to introduce the boundary before it can do its own work.

## Findings by axis

### Token storage

- **Observation:** **Vendor default (Amplify v6 localStorage, `CognitoIdentityServiceProvider.*`).** No v6 `setKeyValueStorage` call, no custom `tokenProvider`, no built-in selector; and (checked for a mid-migration mix) no legacy v5 `storage:` or `cookieStorage:` config either. Version-qualified: this is v6 per `package.json` (`aws-amplify ^6.6.0`).
- **Evidence:** [src/lib/amplify-config.ts:5](src/lib/amplify-config.ts#L5) — bare `Amplify.configure({ Auth: { Cognito: { ... } } })` with no storage key at all.
- **Recommended seam:** A domain `AuthPort` (Session, Principal, `getAuthHeaders`, `refresh`, `onSessionExpired`) with a custom `KeyValueStorageInterface` adapter plugged into `cognitoUserPoolsTokenProvider.setKeyValueStorage`. The adapter lives inside the port; app code speaks your `Session` type only. For HttpOnly cookies specifically, tokens must be written server-side, so the storage adapter becomes a shim that calls a same-origin server route — same seam, different adapter.
- **Cost evidence:** **moderate.** The storage seam itself lives in one file ([src/lib/amplify-config.ts](src/lib/amplify-config.ts)) and `setKeyValueStorage` is a one-call change. The multiplier is downstream: Amplify's silent refresh requires JS-readable tokens, and refresh here is inherited via a bare `fetchAuthSession()` in [src/api/client.ts:14](src/api/client.ts#L14). So a storage adapter alone will silently break refresh — the real cost is *storage adapter + owned refresh + probably a server route*, not one config edit.
- **Likelihood:** **high** (maintainer, via file): *"Yes — planned"* — "moving token storage to HttpOnly cookies next quarter." **Cost confirmed by maintainer: moderate.**

### Refresh and owned runtime behaviors

- **Observation:** **Fully inherited.** The axios request interceptor calls a bare `fetchAuthSession()` on every request. No single-flight dedup, no `forceRefresh` path, no explicit failure route, no `Hub.listen('auth', ...)` for lifecycle events. Amplify's silent refresh is doing all the work — and only works while tokens are JS-readable.
- **Evidence:** [src/api/client.ts:13](src/api/client.ts#L13) and [src/api/client.ts:14](src/api/client.ts#L14) for the inherited pattern; absences confirmed by searching `src/**/*.{ts,tsx}` for module-level `inflight` promises, `refreshOnce` / `singleFlight` helpers, `onSessionExpired` handlers, `interceptors.response` for 401 handling, and `Hub.listen` — none present.
- **Recommended seam:** An owned 401 response interceptor with single-flight dedup (one refresh promise for N concurrent 401s), `fetchAuthSession({ forceRefresh: true })` inside it, and an explicit `onSessionExpired` failure path. Because HttpOnly-cookie tokens cannot be read or refreshed by browser JS, the refresh path will need a server route (e.g. `POST /auth/refresh`) that the client hits — the seam is the same, the adapter changes.
- **Cost evidence:** **moderate.** Only one call site attaches auth to outbound requests ([src/api/client.ts](src/api/client.ts)), so the interceptor rewrite is contained — but nothing exists to extend. Single-flight, failure path, and lifecycle events are net-new machinery; and post-storage-move refresh has to go through a server route rather than `fetchAuthSession`.
- **Likelihood:** **medium** (maintainer, via file): *"Tied to storage"* — refresh changes would happen if/when the storage change happens.

### Identity provider

- **Observation:** **Scattered vendor-specific surface.** `cognito:groups` is read inline in [src/components/UserBadge.tsx:18](src/components/UserBadge.tsx#L18) and again in [src/components/AdminPanel.tsx:15](src/components/AdminPanel.tsx#L15). `cognito:username` is read inline at [src/components/UserBadge.tsx:19](src/components/UserBadge.tsx#L19). `fetchUserAttributes` is called from a page at [src/pages/Profile.tsx:15](src/pages/Profile.tsx#L15) and its `FetchUserAttributesOutput` type crosses into the page at [src/pages/Profile.tsx:8](src/pages/Profile.tsx#L8); a hard-coded `custom:tenantId` attribute is read at [src/pages/Profile.tsx:19](src/pages/Profile.tsx#L19). No adapter localizes any of it.
- **Evidence:** the anchors above (four distinct surfaces across three files).
- **Recommended seam:** Localize every `cognito:*` claim read, every `custom:*` attribute read, and every `fetchUserAttributes` call to a single Cognito adapter behind the `AuthPort`. App code sees a domain `Principal` (id, displayName, tenantId, roles, permissions) — never vendor claim shapes.
- **Cost evidence:** **high.** Coupling is spread across three app-layer files with four distinct vendor surfaces used inline. No adapter and no `Principal` exist — a provider swap here means introducing the boundary AND rewriting every one of those reads.
- **Likelihood:** **none** (maintainer, via file): *"No — locked in"* — "enterprise agreement runs through 2027." Provider-swap risk is off the table for now; the coupling stays, but no work is proposed here.

### Authorization (and token type)

- **Observation:** **Inline claim reads with hard-coded role strings, and the ID token authorizes API calls.** Authorization decisions are inline `cognito:groups` reads with hard-coded role strings in two components: [src/components/UserBadge.tsx:22](src/components/UserBadge.tsx#L22) (`groups.includes("admin")`) and [src/components/AdminPanel.tsx:17](src/components/AdminPanel.tsx#L17) (`groups.includes("admin") || groups.includes("billing-admin")`). The outbound `Authorization` header is the Cognito **ID token**, not the access token, at [src/api/client.ts:15](src/api/client.ts#L15) and [src/api/client.ts:17](src/api/client.ts#L17); `session.tokens?.accessToken` is never read anywhere. No domain `Principal`, no policy layer, no `can(principal, action)`-style helper.
- **Evidence:** anchors above; absence of a `Principal`/policy layer confirmed by searching `src/**/*.{ts,tsx}` for domain `Principal` types, centralized policy modules, and any RBAC/ABAC helper consuming a `Principal` — none present.
- **Recommended seam:** The `AuthPort` produces a domain `Principal` (roles, permissions) mapped from Cognito claims **inside the adapter**. Authorization decisions flow through a single policy function (e.g. `can(principal, action)`) — no inline claim reads, no hard-coded role strings. Attach the **access token** (`session.tokens.accessToken.toString()`) — not the ID token — to outbound API calls; the ID token stays on the identity side.
- **Cost evidence:** **high.** Two components read `cognito:groups` inline with four hard-coded role strings between them (`admin`, `billing-admin`); no `Principal`, no policy layer, no permission vocabulary — every authorization decision is a from-scratch build. The token-type change is a one-line swap on the client, but is meaningless without the backend also accepting the access token, and pointless without a policy layer to consume finer permissions. The three changes are coupled; sequencing matters.
- **Likelihood:** **high** (maintainer, via file): *"RBAC/ABAC or finer permissions"* — "roles are outgrowing the current admin flag."

## Migration-readiness

Same findings, read forward. The maintainer flagged storage, refresh, and authorization as changes on the roadmap; identity provider is locked in for now, so this section covers the three.

- **Token storage — HttpOnly cookies next quarter. Progress: minimal.** Remaining:
  - Introduce an `AuthPort` so the storage strategy is a swappable adapter (today the config is bare and [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts) is a leaky facade).
  - Own refresh (single-flight + `onSessionExpired`) — required before HttpOnly cookies land, since Amplify's silent refresh depends on JS-readable tokens.
  - Write a `KeyValueStorageInterface` adapter that shims to a same-origin server route (server-side cookie writes).
  - Register the adapter via `cognitoUserPoolsTokenProvider.setKeyValueStorage` in [src/lib/amplify-config.ts](src/lib/amplify-config.ts).
- **Refresh — tied to storage. Progress: minimal.** Remaining:
  - axios `interceptors.response` for 401 with retry.
  - Module-level single-flight promise so N concurrent 401s trigger one refresh.
  - Explicit `onSessionExpired` path (route to sign-out or login).
  - Post-storage-move: refresh calls a server endpoint instead of `fetchAuthSession`, since HttpOnly-cookie tokens are not readable by JS.
- **Authorization — RBAC/ABAC; current admin flag is outgrown. Progress: minimal.** Remaining:
  - Domain `Principal` type (roles, permissions) produced by the `AuthPort` adapter.
  - Single policy function / module (e.g. `can(principal, action)`) — replace inline `groups.includes(...)` checks.
  - Remove hard-coded role strings from [src/components/UserBadge.tsx](src/components/UserBadge.tsx) and [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx).
  - Attach the access token — not the ID token — to outbound API requests, coordinated with the backend accepting it.
  - Replace the vendor-shape mock at [__tests__/auth.test.ts](__tests__/auth.test.ts) with a contract suite exercising the policy layer via the `Principal`.

## Prioritized backlog

Ranked by maintainer likelihood × qualitative cost evidence. Order matters: the first task is the multiplier for all the others; the storage move should not ship before refresh is owned.

1. **Introduce a domain `AuthPort` and move the boundary behind it** (starting with [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts), which today is a leaky facade). *Why it ranks here:* every planned change needs a seam that doesn't exist. Absent boundary across all four B-signals; five app-layer direct imports plus a leaky facade. Without this step the other tasks each have to introduce their own boundary and undo the vendor-type leaks in every touched file — do it first or pay it four times. *Scope:* [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts), [src/lib/amplify-config.ts](src/lib/amplify-config.ts), [src/components/UserBadge.tsx](src/components/UserBadge.tsx), [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx), [src/api/client.ts](src/api/client.ts), [src/pages/Profile.tsx](src/pages/Profile.tsx). Introduce the port, refactor callers to consume it, keep the facade file as the initial adapter but stop leaking vendor types through it.

2. **Introduce a domain `Principal` + single policy layer; remove inline `cognito:groups` reads and hard-coded role strings.** *Why it ranks here:* maintainer's likelihood is HIGH (RBAC planned; "roles are outgrowing the current admin flag") and cost evidence is HIGH — inline claim reads in two components with four hard-coded role strings, no `Principal`, no policy function. RBAC has no place to land until this exists. Coupled with task 5: the access-token swap is meaningless without a policy layer to consume richer permissions. *Scope:* [src/components/UserBadge.tsx](src/components/UserBadge.tsx), [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx), [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts).

3. **Own refresh: 401 response interceptor with single-flight dedup, `forceRefresh`, and an `onSessionExpired` failure path.** *Why it ranks here:* maintainer's likelihood is MEDIUM ("tied to storage"), cost evidence is MODERATE — one call site but everything must be built from nothing. **This MUST land before the storage move ships.** Amplify's silent refresh only works while tokens are JS-readable; the moment HttpOnly cookies land, an unowned refresh path breaks silently across every authenticated call. *Scope:* [src/api/client.ts](src/api/client.ts), [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts).

4. **Write a custom `KeyValueStorageInterface` adapter and plug it into `cognitoUserPoolsTokenProvider.setKeyValueStorage`** (as the local step of the HttpOnly-cookie move; the cookie side lives on the server). *Why it ranks here:* maintainer's likelihood is HIGH ("moving to HttpOnly cookies next quarter"; cost confirmed MODERATE). The seam itself is one file, but must ship together with the owned refresh path (task 3) and a same-origin server route for cookie-setting. Sequence AFTER refresh is owned; otherwise inherited refresh breaks the same day the cookies land. *Scope:* [src/lib/amplify-config.ts](src/lib/amplify-config.ts), [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts).

5. **Swap the API `Authorization` header from the ID token to the access token; coordinate with the backend to accept it.** *Why it ranks here:* one-line change on the client (at [src/api/client.ts:15](src/api/client.ts#L15) and [src/api/client.ts:17](src/api/client.ts#L17)) — but real cost depends on whether the backend today verifies ID-token claims or `aud`. Ranked behind the `Principal`/policy work: sending an access token is only meaningful if there is a policy layer consuming the permissions it carries. Do these together, or the swap is symbolic. *Scope:* [src/api/client.ts](src/api/client.ts).

6. **Replace the vendor-mock auth test with a contract/conformance suite that runs against the `AuthPort`.** *Why it ranks here:* cost evidence is LOW once the port from task 1 exists — the current test ([__tests__/auth.test.ts](__tests__/auth.test.ts)) is the wrong shape and can be rewritten. Ranked last because it depends on task 1, but omitting it leaves the boundary structurally present and untestable — the storage/refresh/RBAC changes ship "and pray" instead of "make the contract green." *Scope:* [__tests__/auth.test.ts](__tests__/auth.test.ts), [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts).

This is a backlog, not a patch. The skill recommends seams; it does not edit auth code.

## Judgment calls for you

- **True retrofit cost in your team's terms.** The mechanical basis puts storage/refresh at *moderate* and identity_provider/authorization at *high*, but the wall-clock cost depends on team bandwidth, test-coverage state, and how the backend is prepared to accept access tokens. The cost_evidence above is a mechanical read (boundary quality, spread of coupling, confirmed call-site counts); the "how long will this take in this org" number is yours.
- **Backend readiness for the access-token swap.** Does your backend today accept the Cognito access token, or is it validating (and reading claims from) the ID token? [src/api/client.ts:17](src/api/client.ts#L17) sends the ID token. Moving to access tokens is client-cheap but breaks the backend if the backend is verifying ID-token claims or `aud` values. This is the two-sided-change question the code can't answer.
- **Infra plumbing for the HttpOnly-cookie move.** Is there a same-origin server route you can attach to (e.g. Next.js API route, existing gateway), or will infra need to grow one? HttpOnly cookies can't be written by browser JS, so the storage seam becomes a client shim over a server route — an infra decision, not an app-layer one.

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** It assesses changeability, not vulnerabilities. Storage-liability twin (Axis 1's safety half): tokens live in browser-readable `localStorage` today, which is exposed to XSS exfiltration — worth flagging as a *bounded* current liability that the planned HttpOnly-cookie move would address, but **not** a substitute for a real security review of everything else.
- App↔auth boundary only; infrastructure, gateways, and IaC were out of scope.
- Findings are evidence-backed observations; the prioritization reflects the maintainer's stated inputs (from `_interview.yaml`), shown above.
- **Cost figures are qualitative (low/moderate/high) and based on mechanical evidence.** Real time-to-complete depends on test coverage, team bandwidth, and the per-app call-site reality you know best — confirm before committing to sequencing.
