# Authentication Calcification Audit — `fixtures/calcified-cognito`

**Date:** 2026-06-20
**Vendor profile(s) used:** `amplify-cognito.md` (verified against `aws-amplify` v6 as of 2026-06-17)
**Model used (self-reported):** Claude Opus 4.7
**Mode:** non-interactive

## Summary

AWS Amplify v6 / Cognito. **No real boundary exists** — the [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts) module looks like a wrapper but returns Amplify's `AuthSession` and `AuthUser` types unchanged, so the vendor's shape leaks across all callers. Vendor imports are scattered across five application-layer files; storage is the default localStorage; refresh is inherited vendor magic with no 401 path; and the **ID token** authorizes every API call. All four axes are calcified.

## What auth calcification means (for this codebase)

Auth calcification is the degree to which a change that should be local — swap token storage, change refresh, replace the identity provider, move from inline claim reads to a real authorization model — has instead become a cross-cutting rewrite because the vendor's types and behaviors leaked everywhere. **This codebase is calcified across all four axes:** the vendor's session shape is the return type in two app-layer files, claim names are read inline in three components/pages, and there's no boundary module localizing change. Any of the four future changes below would touch scattered call sites today, not one adapter.

## Coverage

- **Comprehensively read** (every relevant region opened): [src/lib/amplify-config.ts](src/lib/amplify-config.ts), [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts), [src/api/client.ts](src/api/client.ts), [src/components/UserBadge.tsx](src/components/UserBadge.tsx), [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx), [src/pages/Profile.tsx](src/pages/Profile.tsx), [__tests__/auth.test.ts](__tests__/auth.test.ts), plus [package.json](package.json) for vendor identification.
- **Sampled via grep + confirm:** none — the fixture is small enough that every relevant file was read in full.
- **Not analyzed or low-confidence:** none. All files parsed; no dynamic imports; no unparseable regions; no detected-but-unprofiled vendors.

## Boundary assessment

The boundary is **ABSENT on all four signals**. A weak boundary is the root cause: every axis below is expensive precisely because there is no seam localizing the vendor.

- **Anti-corruption layer — ABSENT.** Vendor types leak into application-layer signatures and state in five locations:
  - [src/lib/auth-helpers.ts:8](src/lib/auth-helpers.ts#L8) — `getSession(): Promise<AuthSession>` returns the vendor type
  - [src/lib/auth-helpers.ts:14](src/lib/auth-helpers.ts#L14) — `getUser(): Promise<AuthUser>` returns the vendor type
  - [src/components/UserBadge.tsx:11](src/components/UserBadge.tsx#L11) — `useState<AuthSession | null>` typed with vendor type
  - [src/components/UserBadge.tsx:33](src/components/UserBadge.tsx#L33) — `getCurrentSession(): Promise<AuthSession>` exported with vendor return type
  - [src/pages/Profile.tsx:12](src/pages/Profile.tsx#L12) — `useState<FetchUserAttributesOutput | null>` typed with vendor type

  The [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts) module is a **leaky facade** — it looks like a boundary by name but hands vendor types straight to every caller. This should NOT be credited as a real boundary.

- **Injected vs imported — ABSENT.** Auth is reached via direct vendor imports in five files; no `AuthPort`-style interface exists:
  - [src/api/client.ts:7](src/api/client.ts#L7), [src/components/UserBadge.tsx:8](src/components/UserBadge.tsx#L8), [src/components/AdminPanel.tsx:7](src/components/AdminPanel.tsx#L7), [src/pages/Profile.tsx:6](src/pages/Profile.tsx#L6), [src/lib/auth-helpers.ts:6](src/lib/auth-helpers.ts#L6).

- **Contract-tested — ABSENT.** [__tests__/auth.test.ts:9](__tests__/auth.test.ts#L9) mocks `aws-amplify/auth` and the assertions at [__tests__/auth.test.ts:27](__tests__/auth.test.ts#L27) read against Amplify's `AuthSession` shape (`cognito:groups` payload). No `AuthPort` contract suite exists. These tests pass today and would die on migration.

- **Client/server split absorbed — N/A.** No SSR code in this fixture.

## Findings by axis

### Token storage

- **Observation:** Inherited default — browser `localStorage`. No custom storage adapter. v6 patterns checked (`setKeyValueStorage`, `cognitoUserPoolsTokenProvider`, `KeyValueStorageInterface`); v5 patterns checked too (`cookieStorage:` and `storage:` keys inside `Amplify.configure({ Auth: ... })`). Neither found.
- **Evidence:** [src/lib/amplify-config.ts:5](src/lib/amplify-config.ts#L5) — `Amplify.configure({ Auth: { Cognito: { userPoolId, userPoolClientId } } })` with no storage configuration of any kind.
- **Recommended seam:** A class implementing `KeyValueStorageInterface` (from `aws-amplify/utils`), passed to `cognitoUserPoolsTokenProvider.setKeyValueStorage(...)` inside the boundary/adapter module. Storage swaps then become one adapter change instead of a config edit scattered per environment.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

### Refresh and owned runtime behaviors

- **Observation:** Inherited vendor magic. Bare `fetchAuthSession()` calls with no 401-interceptor, no single-flight deduplication, no explicit failure path. The silent auto-refresh that Amplify provides is the *only* refresh mechanism — and it depends on tokens being JS-readable (would break on a move to HttpOnly cookies).
- **Evidence:** [src/api/client.ts:14](src/api/client.ts#L14) — axios request interceptor calls `await fetchAuthSession()` and attaches the result to the header; the surrounding interceptor has no 401 retry path, no `onSessionExpired`-style failure handling, and no wrapper around `fetchAuthSession` that would deduplicate concurrent refreshes.
- **Recommended seam:** Owned 401-handling at the boundary — an `onRefresh()` method, a single-flight wrapper so N concurrent 401s trigger one refresh, and an explicit `onSessionExpired()` failure path. The methodology document gives the single-flight pattern.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

### Identity provider

- **Observation:** Cognito-specific features scattered across three application-layer files. Not localized to an adapter.
- **Evidence:**
  - [src/components/UserBadge.tsx:18](src/components/UserBadge.tsx#L18) — `payload["cognito:groups"]` read inline
  - [src/components/UserBadge.tsx:19](src/components/UserBadge.tsx#L19) — `payload["cognito:username"]` read inline
  - [src/components/AdminPanel.tsx:15](src/components/AdminPanel.tsx#L15) — `payload["cognito:groups"]` read inline (second occurrence in a different file — *scattered* coupling)
  - [src/pages/Profile.tsx:7](src/pages/Profile.tsx#L7) — `fetchUserAttributes` (Cognito-only API) called from page-level code
  - [src/pages/Profile.tsx:19](src/pages/Profile.tsx#L19) — Cognito custom attribute `custom:tenantId` read inline
- **Recommended seam:** Localize all vendor-specific surface inside one adapter (claim mapping, custom-attribute access, `fetchUserAttributes`). App code should consume a domain `Principal`, never see Cognito-specific claim names.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

### Authorization (and token type)

- **Observation:** Authorization decisions made by reading vendor claim shapes inline at three call sites with hard-coded role strings. No domain `Principal` or policy layer. The **ID token** authorizes every API request — the documented Cognito anti-pattern; access token should be used for API auth.
- **Evidence (claims/roles):**
  - Inline `cognito:groups` reads at [src/components/UserBadge.tsx:18](src/components/UserBadge.tsx#L18) and [src/components/AdminPanel.tsx:15](src/components/AdminPanel.tsx#L15)
  - Hard-coded role strings: `"admin"` at [src/components/UserBadge.tsx:22](src/components/UserBadge.tsx#L22); `"admin"` and `"billing-admin"` at [src/components/AdminPanel.tsx:17](src/components/AdminPanel.tsx#L17)
  - Inline custom-attribute read `custom:tenantId` at [src/pages/Profile.tsx:19](src/pages/Profile.tsx#L19)
- **Evidence (token type):** [src/api/client.ts:15](src/api/client.ts#L15) — `session.tokens?.idToken?.toString()` attached to `Authorization: Bearer ...` header. Should be `accessToken`, not `idToken`.
- **Recommended seam:** Domain `Principal` (carrying `roles`, `tenantId`, etc.) produced by the adapter from vendor claims; a single policy module exposing `can(principal, action)`; the access token attached to outbound API calls, not the ID token.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

## Migration-readiness

Not applicable — non-interactive run with no maintainer-flagged changes. This section appears only when the maintainer indicated a specific change on the table during the Phase 2 interview.

## Prioritized backlog

Not applicable — non-interactive run with no likelihood inputs from the maintainer. No priority ranking can be produced honestly without those inputs. Re-run interactively (or supply answers) to get a ranked backlog.

## Judgment calls for you

Answer these (or re-run interactively) to get a ranked backlog:

- **Token storage** — Is a move off localStorage (HttpOnly cookies, encrypted store, server-managed session) actually on the roadmap? Mechanical evidence shows no custom adapter; the question of whether one is *worth* writing depends on your roadmap and security posture.
- **Refresh ownership** — Independent decision, or downstream of a storage move? (A move to HttpOnly cookies breaks Amplify's silent client-side refresh and forces owned refresh, so the two are coupled.)
- **Identity provider** — Is a provider swap realistic in the next 12-24 months, or is the value of decoupling purely defensive? Determines whether boundary work is urgent or optional.
- **Authorization model** — Is RBAC/ABAC or finer permissions planned? Is consolidating onto the access token (away from ID-for-API) planned? The three inline claim reads and five hard-coded role strings are cheap to fix *now*, expensive once the authz model spreads.
- **True retrofit cost** — All cost language above is qualitative (counts of call sites, files affected). The real time-to-complete depends on team bandwidth, test coverage, and the per-app reality. Confirm before committing to sequencing.

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** It assesses changeability, not vulnerabilities. The storage finding (tokens in browser-readable localStorage, exposed to XSS exfiltration; leaked refresh token would grant long-lived access) is noted as a *changeability* concern under Axis 1; a real security review would assess the full threat model and is recommended separately.
- **App ↔ auth boundary only.** Infrastructure, API gateways, Lambda authorizers, IaC out of scope.
- **Findings are evidence-backed observations.** Every `file:line` reference is a clickable link.
- **Cost figures are qualitative** (low/moderate/high anchored to mechanical evidence) and intended as inputs to *your* time/bandwidth estimate, not as a substitute for it.
