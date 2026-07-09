# Authentication Calcification Audit — `bounded-auth0` fixture

**Date:** 2026-07-08
**Vendor profile(s) used:** `auth0.md` (last verified 2026-06-17)
**Model used (self-reported):** `claude-opus-4-7`
**Mode:** non-interactive
**Skill version:** 1.3.0
**Machine-readable record:** [auth-calcification-audit.json](auth-calcification-audit.json)

## Summary

The codebase uses `@auth0/auth0-spa-js` v2 as its sole identity provider, and every mechanical seam the methodology asks for is in place: a custom `ICache` implementation ([src/auth/adapters/auth0.ts:23](src/auth/adapters/auth0.ts#L23)) holds token storage, refresh is interceptor-owned with single-flight ([src/api/client.ts:19](src/api/client.ts#L19), [src/auth/refresh.ts:6](src/auth/refresh.ts#L6)), and outbound API calls carry the access token with `audience` configured — so the opaque-token / ID-token-for-API anti-pattern the Auth0 profile warns about is structurally unreachable. The one item worth naming without maintainer input is that `MemoryCache` at [src/auth/adapters/auth0.ts:23](src/auth/adapters/auth0.ts#L23) is a fixture-grade in-memory store: the seam to swap it is present but the intended production `ICache` is not yet written.

## What auth calcification means (for this codebase)

Auth calcification is the degree to which a change that should be local — swap token storage, change refresh, replace the identity provider, move from inline claim reads to a real authorization model — has instead become a cross-cutting rewrite because the vendor's types and behaviors leaked everywhere. This codebase is on the well-bounded end: an `AuthPort` interface ([src/auth/port.ts:6](src/auth/port.ts#L6)) is the contract, `@auth0/auth0-spa-js` is imported only in [src/auth/adapters/auth0.ts:14](src/auth/adapters/auth0.ts#L14), and the same `runAuthContractTests` suite ([__tests__/auth-contract.test.ts:47](__tests__/auth-contract.test.ts#L47)) exercises both an in-memory `FakeAuth` and the real Auth0 adapter. Any of the four future changes below stays local — one file (storage), zero files (refresh, already owned), one sibling adapter (provider swap), or one policy file (authorization).

## Coverage

- **Comprehensively read** (every relevant region opened):
  - [src/auth/adapters/auth0.ts](src/auth/adapters/auth0.ts) — boundary/adapter module, the only file importing `@auth0/auth0-spa-js`; load-bearing for all four axes.
  - [src/auth/port.ts](src/auth/port.ts), [src/auth/types.ts](src/auth/types.ts), [src/auth/refresh.ts](src/auth/refresh.ts), [src/auth/policy.ts](src/auth/policy.ts), [src/auth/context.tsx](src/auth/context.tsx) — the domain contract, vocabulary, single-flight helper, policy layer, and DI wiring.
  - [src/api/client.ts](src/api/client.ts) — the 401 interceptor / owned-refresh path.
  - [src/components/UserBadge.tsx](src/components/UserBadge.tsx), [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx), [src/pages/Profile.tsx](src/pages/Profile.tsx) — leak-check targets.
  - [__tests__/auth-contract.test.ts](__tests__/auth-contract.test.ts) — B3 evidence.
  - [package.json](package.json) — vendor detection (confirmed `@auth0/auth0-spa-js` v2 is the only auth SDK).
- **Sampled via grep + confirm:** none — the codebase is small enough that every file above was read in full.
- **Not analyzed or low-confidence:** none. No unparseable files, no dynamic auth imports, no unprofiled vendor. Backend/infrastructure surface is out of scope by design.

## Boundary assessment

- **Anti-corruption layer** — **present.** Domain types (`Principal`, `Session`, `AuthError`) live in [src/auth/types.ts:4](src/auth/types.ts#L4). Auth0 vendor types (`Auth0Client`, `ICache`) appear only inside [src/auth/adapters/auth0.ts:12](src/auth/adapters/auth0.ts#L12) and the `vi.mock('@auth0/auth0-spa-js')` block in [__tests__/auth-contract.test.ts](__tests__/auth-contract.test.ts) — both correct locations. The complete set of vendor-type patterns searched (`Auth0Client`, `ICache`, `GetTokenSilentlyOptions`, `Auth0ContextInterface`, `AppState`, `IdToken`, `User`, `useAuth0`) returned zero app-layer hits.
- **Injected vs imported** — **present.** [src/auth/port.ts:6](src/auth/port.ts#L6) defines `AuthPort`; [src/auth/context.tsx:13](src/auth/context.tsx#L13) injects it via React context; [src/api/client.ts:7](src/api/client.ts#L7) receives it as a factory parameter. No app-layer file imports auth directly from the vendor.
- **Contract-tested** — **present.** [__tests__/auth-contract.test.ts:47](__tests__/auth-contract.test.ts#L47) defines `runAuthContractTests` and runs it against both `FakeAuth` ([:96](__tests__/auth-contract.test.ts#L96)) and the real adapter ([:115](__tests__/auth-contract.test.ts#L115)) with the SDK mocked at the import boundary. The suite explicitly asserts vendor claim names never leak into the `Principal` shape ([:73](__tests__/auth-contract.test.ts#L73)) — the boundary is tested independently of the vendor.
- **Client/server split absorbed** — **not applicable.** This is a pure SPA (`@auth0/auth0-spa-js`, React 18). Search for SSR entry points (`@auth0/nextjs-auth0`, `handleAuth`, `getSession`, `withApiAuthRequired`, `getServerSession`) returned zero hits. The one `typeof window` check at [src/auth/adapters/auth0.ts:134](src/auth/adapters/auth0.ts#L134) is defensive code inside the adapter's `signOut`, not app-layer branching to obtain auth.

The boundary is not weak — the axes below inherit its strength.

## Findings by axis

### Token storage

- **Observation:** Custom `ICache` adapter — the real Auth0 storage seam. Not `cacheLocation` (the built-in selector look-alike the profile warns about; `cacheLocation` is not set anywhere in the tree).
- **Evidence:** `MemoryCache implements ICache` at [src/auth/adapters/auth0.ts:23](src/auth/adapters/auth0.ts#L23); passed as `cache: new MemoryCache()` at [src/auth/adapters/auth0.ts:65](src/auth/adapters/auth0.ts#L65); paired with `useRefreshTokens: true` at [src/auth/adapters/auth0.ts:64](src/auth/adapters/auth0.ts#L64).
- **Recommended seam:** The `ICache` seam is already the recommended shape. Any storage change is a single-file swap of `MemoryCache` for a concrete implementation targeting the intended storage (HttpOnly-cookie-backed, encrypted store, session cookies). App code doesn't move.
- **Cost evidence:** **low** — the seam exists in one file; zero app-code call sites touch storage.
- **Likelihood:** see *Judgment calls* — whether an actual storage change is planned (or whether `MemoryCache` is expected to stand) is the maintainer's answer.

### Refresh and owned runtime behaviors

- **Observation:** Fully owned. 401 interceptor + single-flight collapsing + explicit failure path — the exact shape the methodology names.
- **Evidence:** 401 path at [src/api/client.ts:19](src/api/client.ts#L19), retry logic to [src/api/client.ts:22](src/api/client.ts#L22)–[:23](src/api/client.ts#L23) (`auth.onSessionExpired()` on continued failure). Single-flight helper at [src/auth/refresh.ts:6](src/auth/refresh.ts#L6). Adapter's `onRefresh` wraps `getAccessTokenSilently({ cacheMode: "off", ... })` inside `refreshOnce` at [src/auth/adapters/auth0.ts:106](src/auth/adapters/auth0.ts#L106)–[:112](src/auth/adapters/auth0.ts#L112) — `cacheMode: "off"` combined with `useRefreshTokens: true` means refresh actually rotates the token rather than serving a still-valid cached value.
- **Recommended seam:** Already in place. No refactor recommended.
- **Cost evidence:** **low** — no app-layer file holds a bare vendor refresh call. If refresh moves entirely server-side, the change is inside the adapter's `onRefresh` body.
- **Likelihood:** see *Judgment calls*.

### Identity provider

- **Observation:** Localized. Every Auth0-specific surface — `createAuth0Client`, `audience`, `scope`, `useRefreshTokens`, `Auth0Client`, `ICache`, namespaced-claim URL keys, `client.logout({ logoutParams })` — sits inside a single adapter file.
- **Evidence:** `createAuth0Client` + `authorizationParams` + `audience` at [src/auth/adapters/auth0.ts:57](src/auth/adapters/auth0.ts#L57)–[:61](src/auth/adapters/auth0.ts#L61); namespaced-claim reads at [src/auth/adapters/auth0.ts:100](src/auth/adapters/auth0.ts#L100)–[:101](src/auth/adapters/auth0.ts#L101); `client.logout` at [src/auth/adapters/auth0.ts:131](src/auth/adapters/auth0.ts#L131). Every component and page consumes only `../auth/context` and `../auth/policy` (see [src/components/UserBadge.tsx](src/components/UserBadge.tsx), [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx), [src/pages/Profile.tsx](src/pages/Profile.tsx)).
- **Recommended seam:** The adapter file *is* the seam. A provider swap = write a sibling adapter (e.g. `src/auth/adapters/<new-vendor>.ts`) that implements `AuthPort`; pass it through `AuthProvider`; run [__tests__/auth-contract.test.ts](__tests__/auth-contract.test.ts) — green means done.
- **Cost evidence:** **low** — zero vendor-surface call sites outside the adapter, and the contract suite makes "migration complete" mechanically checkable.
- **Likelihood:** see *Judgment calls*.

### Authorization (and token type)

- **Observation:** Bounded on both sub-axes. Claims read via a domain policy, not inline; the outbound `Authorization` header carries the access token with `audience` configured.
- **Evidence (claims):** Policy at [src/auth/policy.ts:13](src/auth/policy.ts#L13); consumers go through `can()` at [src/components/AdminPanel.tsx:10](src/components/AdminPanel.tsx#L10) and [src/components/UserBadge.tsx:12](src/components/UserBadge.tsx#L12). Namespaced-claim reads (`user[`${ns}roles`]`, `user[`${ns}tenantId`]`) exist only in the adapter's `getPrincipal` at [src/auth/adapters/auth0.ts:100](src/auth/adapters/auth0.ts#L100)–[:101](src/auth/adapters/auth0.ts#L101); no inline `user['https://.../…']` reads survive elsewhere.
- **Evidence (token type):** `getAccessTokenSilently({ authorizationParams: { audience, scope } })` at [src/auth/adapters/auth0.ts:79](src/auth/adapters/auth0.ts#L79)–[:83](src/auth/adapters/auth0.ts#L83), attached as `Bearer` at [src/auth/adapters/auth0.ts:85](src/auth/adapters/auth0.ts#L85). `audience` is a required field on `Auth0AdapterOptions`, so the opaque-token / ID-token-for-API misuse the profile warns about is structurally unreachable without changing the adapter's public shape.
- **Recommended seam:** Adapter → domain `Principal` → `policy.can`. To extend the authorization model (permissions, scoped actions, organizations), extend `Principal` and `policy.ts`; components remain unchanged.
- **Cost evidence:** **low** — one policy file mediates authorization; two confirmed component call sites both go through `can()`.
- **Likelihood:** see *Judgment calls*.

## Migration-readiness

Not applicable — non-interactive run: no maintainer flagged a change to read the findings forward against.

## Judgment calls for you

- **Storage (Axis 1)** — *Is a token storage change actually on the table (e.g., moving `MemoryCache` to an HttpOnly-cookie-backed or encrypted `ICache`), or is in-memory acceptable for now?* The seam is exercised — swapping the implementation is a single-file change — but `MemoryCache` itself is fixture-grade. Whether it counts as "done" or "todo" depends on the intended production storage posture, which isn't in the code.
- **Refresh (Axis 2)** — *Any owned-refresh change planned beyond what's already here (e.g., moving refresh entirely server-side via HttpOnly cookies)?* Refresh is already interceptor-owned with single-flight and an explicit failure path. This is a maintainer call and ties into the storage decision above.
- **Identity provider (Axis 3)** — *Is a provider swap on the roadmap (12–24 months), or is Auth0 locked in for defensive/compliance reasons?* Mechanically the swap is cheap; the value of doing the migration prep work depends on how likely the swap actually is.
- **Authorization (Axis 4)** — *Are authorization model changes planned — finer permissions (RBAC via Auth0 API RBAC, ABAC), Organizations, or a shift to server-issued permission claims — that would extend the current role-string-based policy?* The current model is a role→action map in [src/auth/policy.ts:8](src/auth/policy.ts#L8)–[:11](src/auth/policy.ts#L11); moving to permission-scoped decisions is cheap inside `policy.ts` + `Principal` but only worth doing if planned.
- **Non-axis: `MemoryCache` in production** — *Is this fixture-grade code representative of the intended production store, or a placeholder to be replaced before shipping?* In-memory token storage evaporates on tab close and provides no isolation from XSS in the same origin; the seam is right but the destination might not be.

Because this run is non-interactive and no likelihood input was supplied, no prioritized backlog is produced. Re-run interactively (or with a pre-filled answers file) to get a ranked backlog against the maintainer's actual roadmap.

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** It assesses changeability, not vulnerabilities. The "MemoryCache in production" note above is an XSS-adjacent observation raised because it also affects the *cost* of changing storage; it is not a security assessment — get a real security review for anything downstream of "should we change storage."
- App↔auth boundary only; backend infrastructure, API gateways, and IaC were out of scope.
- Findings are evidence-backed observations; no prioritization was produced (non-interactive run — the ranking inputs are the maintainer's).
- **Cost figures are qualitative (low/moderate/high) and based on mechanical evidence** — boundary quality, spread of coupling, confirmed call-site counts. Real time-to-complete depends on test coverage, team bandwidth, and per-app call-site realities the maintainer knows best.
