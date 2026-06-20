# Authentication Calcification Audit — `fixtures/bounded-auth0`

**Date:** 2026-06-20
**Vendor profile(s) used:** `auth0.md` (verified against `@auth0/auth0-spa-js` v2 / `@auth0/auth0-react` v2 as of 2026-06-17)
**Model used (self-reported):** Claude Opus 4.7
**Mode:** non-interactive

## Summary

Auth0 SPA SDK v2. **A real boundary exists and is enforced.** An `AuthPort` interface ([src/auth/port.ts](src/auth/port.ts)) defines the contract; a single adapter ([src/auth/adapters/auth0.ts](src/auth/adapters/auth0.ts)) is the only file that imports `@auth0/auth0-spa-js`; vendor types never appear in application-layer signatures. All four axes are bounded: a custom `ICache` implements Auth0's real storage seam (NOT the `cacheLocation` look-alike), refresh is owned with single-flight, namespaced custom-claim reads are localized to the adapter, the access token (with `audience` configured — Auth0's documented anti-pattern correctly avoided) authorizes API calls, and a contract suite runs the same assertions against the real adapter and a `FakeAuth` test double.

**Portability proof:** nine app-layer files in this fixture ([src/auth/port.ts](src/auth/port.ts), [src/auth/types.ts](src/auth/types.ts), [src/auth/refresh.ts](src/auth/refresh.ts), [src/auth/policy.ts](src/auth/policy.ts), [src/auth/context.tsx](src/auth/context.tsx), [src/api/client.ts](src/api/client.ts), [src/components/UserBadge.tsx](src/components/UserBadge.tsx), [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx), [src/pages/Profile.tsx](src/pages/Profile.tsx)) are **byte-identical** to their bounded-cognito counterparts (verified by `diff`). Only the adapter, `package.json` dependency, and the mocked vendor in the contract test differ. That structural sameness is the demonstration the boundary travels across providers.

## What auth calcification means (for this codebase)

Auth calcification is the degree to which a change that should be local — swap token storage, change refresh, replace the identity provider, move from inline claim reads to a real authorization model — has instead become a cross-cutting rewrite because the vendor's types and behaviors leaked everywhere. **This codebase is well-bounded:** an `AuthPort` interface, vendor types confined to one adapter, a domain `Principal` with a single policy layer, and a contract suite that tests the boundary itself. The same suite that runs against this Auth0 adapter also runs against the Cognito adapter in the sibling fixture — that's not theoretical portability, it's empirical.

## Coverage

- **Comprehensively read** (every relevant region opened): [src/auth/port.ts](src/auth/port.ts), [src/auth/types.ts](src/auth/types.ts), [src/auth/refresh.ts](src/auth/refresh.ts), [src/auth/policy.ts](src/auth/policy.ts), [src/auth/context.tsx](src/auth/context.tsx), [src/auth/adapters/auth0.ts](src/auth/adapters/auth0.ts), [src/api/client.ts](src/api/client.ts), [src/components/UserBadge.tsx](src/components/UserBadge.tsx), [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx), [src/pages/Profile.tsx](src/pages/Profile.tsx), [__tests__/auth-contract.test.ts](__tests__/auth-contract.test.ts), plus [package.json](package.json).
- **Sampled via grep + confirm:** none — the fixture is small enough that every file was read in full. Confirmed by grep that no `@auth0/auth0-spa-js` import appears outside the adapter, and that no namespaced-claim URL (`https://example.com/*`) appears outside the adapter.
- **Cross-fixture verification:** byte-equality of nine app-layer files vs `fixtures/bounded-cognito/` confirmed by `diff` — the only files that differ between the two bounded fixtures are the adapter, `package.json`, the README, and the mocked vendor module in the contract test.
- **Not analyzed or low-confidence:** none. All files parsed; no dynamic imports; no detected-but-unprofiled vendors.

## Boundary assessment

The boundary is **PRESENT on all four signals**.

- **Anti-corruption layer — PRESENT.** Domain types (`Principal`, `Session`, `AuthError`) defined at [src/auth/types.ts](src/auth/types.ts). Vendor types (`Auth0Client`, `ICache`, Auth0's `User`) appear only inside [src/auth/adapters/auth0.ts](src/auth/adapters/auth0.ts). Every app-layer file traffics in `Principal` and `AuthPort`, never Auth0's `User` or `Auth0Client`. Confirmed by reading every signature.

- **Injected vs imported — PRESENT.** An `AuthPort` contract exists at [src/auth/port.ts:6](src/auth/port.ts#L6). The API client receives the port by injection ([src/api/client.ts:7](src/api/client.ts#L7) — `createApiClient(auth: AuthPort)`). The React layer injects via context ([src/auth/context.tsx:13](src/auth/context.tsx#L13)) so components consume `useAuth()` rather than importing the vendor. No `@auth0/*` import outside the single adapter file.

- **Contract-tested — PRESENT.** The same `runAuthContractTests` conformance suite ([__tests__/auth-contract.test.ts:50](__tests__/auth-contract.test.ts#L50)) is run against `FakeAuth` ([__tests__/auth-contract.test.ts:100](__tests__/auth-contract.test.ts#L100)) AND against the real `Auth0AuthAdapter` with the Auth0 SDK mocked at the import boundary ([__tests__/auth-contract.test.ts:115](__tests__/auth-contract.test.ts#L115)). The assertions are on the `AuthPort` contract and the domain `Principal` shape — never on namespaced-claim URLs or Auth0-specific keys. This suite is structurally identical to the one in bounded-cognito; the assertion code is the same, only the mocked vendor module differs.

- **Client/server split absorbed — N/A.** No SSR code in this fixture. (Auth0's Next.js SDK — `@auth0/nextjs-auth0` — would be the route for a server-side adapter; this fixture stays on the SPA SDK.)

## Findings by axis

### Token storage

- **Observation:** Custom `ICache` implementation. The fixture defines `MemoryCache` implementing Auth0's `ICache` interface and passes it to `createAuth0Client({ cache: new MemoryCache(), ... })`. This is Auth0's **real storage seam** — NOT the `cacheLocation: 'memory' | 'localstorage'` built-in selector (the Auth0 look-alike trap). Storage is swappable — to move to HttpOnly cookies, encrypted store, or a server-mediated cache, replace this single class.
- **Evidence:** [src/auth/adapters/auth0.ts:23](src/auth/adapters/auth0.ts#L23) (class definition implementing `ICache`); [src/auth/adapters/auth0.ts:65](src/auth/adapters/auth0.ts#L65) (registration via `cache:` option to `createAuth0Client`).
- **Recommended seam:** The seam is in place.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

### Refresh and owned runtime behaviors

- **Observation:** Owned refresh with single-flight deduplication. The same `refreshOnce` helper used in bounded-cognito wraps `getAccessTokenSilently({ cacheMode: "off", ... })` — Auth0's force-refresh path (uses the refresh token because `useRefreshTokens: true` is set).
- **Evidence:**
  - Single-flight wrapper at [src/auth/refresh.ts:6](src/auth/refresh.ts#L6) — identical to bounded-cognito; N concurrent 401s collapse into one refresh
  - Owned 401 path at [src/api/client.ts:19](src/api/client.ts#L19) — identical to bounded-cognito; same `auth.onRefresh()` → retry → `auth.onSessionExpired()` shape
  - Adapter wires the refresh through the single-flight helper at [src/auth/adapters/auth0.ts:105](src/auth/adapters/auth0.ts#L105) — `refreshOnce(...)` calling `getAccessTokenSilently({ cacheMode: "off", authorizationParams: { audience, scope } })`
- **Auth0 refresh-model note (per profile):** Auth0's refresh model is more explicit than Amplify's auto-refresh, but the *inherited vs owned* distinction is the same — bare `getAccessTokenSilently()` calls scattered across app code with no single-flight wrapping would still be the inherited signal. Here it's properly owned.
- **Recommended seam:** In place.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

### Identity provider

- **Observation:** Auth0-specific surface (SDK imports, `ICache` interface, namespaced custom-claim URLs, `audience`/`scope` configuration, `cacheMode` knob) is **localized to a single adapter file**. App code consumes only the domain `Principal`.
- **Evidence:**
  - [src/auth/adapters/auth0.ts:10](src/auth/adapters/auth0.ts#L10) is the only file importing `@auth0/auth0-spa-js`
  - Namespaced claim URLs (`${namespace}roles`, `${namespace}tenantId`) appear only at [src/auth/adapters/auth0.ts:100](src/auth/adapters/auth0.ts#L100), mapped to `Principal.roles` / `Principal.tenantId`
  - All other files consume `Principal.roles`, `Principal.tenantId`, etc.
- **Recommended seam:** In place. A provider swap is a new sibling adapter implementing `AuthPort` and passing the contract suite — app code does not change. This fixture *is* a worked example of that swap (Cognito → Auth0).
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

### Authorization (and token type)

- **Observation (claims/roles):** Bounded. Auth0's namespaced claims are mapped to a domain `Principal` inside the adapter; authorization decisions go through the single policy layer (`can(principal, action)`). No inline namespaced-claim URL reads or hard-coded role strings in application code.
- **Observation (token type):** **Access token** authorizes API calls, with **`audience` configured** in both the client setup and on every `getAccessTokenSilently()` call. Per the Auth0 profile: a missing `audience` would yield an opaque non-JWT token (Auth0's documented anti-pattern); this fixture has `audience` set, so the token returned is a real JWT API access token.
- **Evidence (claims/roles):**
  - Domain mapping inside the adapter at [src/auth/adapters/auth0.ts:97](src/auth/adapters/auth0.ts#L97) — namespaced claims → `Principal`
  - Single policy layer at [src/auth/policy.ts:13](src/auth/policy.ts#L13) — same `can(principal, action)` as bounded-cognito
  - App-layer usage of the policy at [src/components/AdminPanel.tsx:10](src/components/AdminPanel.tsx#L10) and [src/components/UserBadge.tsx:12](src/components/UserBadge.tsx#L12) — `can(principal, "admin.view")`
- **Evidence (token type):** [src/auth/adapters/auth0.ts:79](src/auth/adapters/auth0.ts#L79) — `getAccessTokenSilently({ authorizationParams: { audience, scope } })`. `audience` flows through from adapter construction ([src/auth/adapters/auth0.ts:42](src/auth/adapters/auth0.ts#L42) — required, with a comment documenting the opaque-token trap).
- **Recommended seam:** In place. To add finer-grained permissions (RBAC/ABAC), extend `Principal` and the policy module without touching components — the model change is local.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

## Migration-readiness

Not applicable for this run — non-interactive, no maintainer-flagged changes. The structural readiness is high across the board (boundary present, custom storage, owned refresh, policy layer, access token, contract suite); for any of the four axes the maintainer might flag, the remaining work would be small and local.

The most consequential migration-readiness observation isn't axis-by-axis — it's the **portability empirically demonstrated**: this fixture and bounded-cognito are the same nine app-layer files behind two different adapters, with the same contract suite passing both. That is what "swap provider = make the new adapter pass the suite" looks like once it's actually done.

## Prioritized backlog

Not applicable — non-interactive run with no likelihood inputs. No priority ranking can be produced honestly without those. Re-run interactively to get a ranked backlog.

## Judgment calls for you

Even with a fully bounded shape, only you can answer:

- **Token storage** — Is a move off the in-memory `ICache` (to HttpOnly cookies, encrypted store, server-side cache) actually planned? The seam is ready; the question is whether to invest.
- **Refresh ownership** — Are sibling behaviors (sign-out propagation across tabs, multi-tab session sync, silent re-auth) on the roadmap? The `AuthPort` makes them straightforward to add; they aren't implemented today. Auth0 does not provide automatic multi-tab sync — confirm that's expected.
- **Identity provider** — Another provider swap (Auth0 → something else) on the roadmap, or is the value of decoupling purely defensive optionality at this point? You've already done one swap structurally (Cognito → Auth0 here); the same pattern would apply.
- **Authorization model** — Is RBAC/ABAC, Auth0 Organizations, or finer permissions planned? The policy layer keeps the model change local; the question is whether the model change itself is coming.
- **True retrofit cost** — All findings above are structural ("seam present", "single adapter file"). The real time-to-complete depends on team bandwidth and test coverage you know best.

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** It assesses changeability, not vulnerabilities. The in-memory `ICache` is for fixture purposes; a production deployment should use a backend appropriate to the threat model — that decision is out of scope here.
- **App ↔ auth boundary only.** Infrastructure, API gateways, IaC out of scope.
- **Findings are evidence-backed observations.** Every `file:line` reference is a clickable link.
- **Cost figures are qualitative** (low/moderate/high anchored to mechanical evidence) and intended as inputs to *your* time/bandwidth estimate, not as a substitute for it.
