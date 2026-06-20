# Authentication Calcification Audit — `fixtures/mixed-edge-cases`

**Date:** 2026-06-20
**Vendor profile(s) used:** `amplify-cognito.md` and `auth0.md` (both verified 2026-06-17)
**Model used (self-reported):** Claude Opus 4.7
**Mode:** non-interactive

## Summary

A codebase **mid-migration from Auth0 to Cognito**, with **Firebase analytics** alongside. Three vendor packages detected (`aws-amplify`, `@auth0/auth0-spa-js`, `firebase`); two have profiles, **`firebase` does not — it is recorded as a coverage gap, not silently dropped**. The verdict is split per vendor: the **Cognito side is structurally bounded** (new `AuthPort`, single adapter) **but trips the look-alike storage trap** — `sessionStorage` from `aws-amplify/utils` is passed to `setKeyValueStorage`, which is a *built-in selector*, NOT a custom adapter, so storage is not actually swappable. The **Auth0 side is calcified** — leaky facade, direct vendor imports in app code, inline namespaced-claim reads, and `getTokenSilently()` called with **no `audience` configured** (Auth0's documented anti-pattern: returns an opaque non-JWT token).

## What auth calcification means (for this codebase)

Auth calcification is the degree to which a change that should be local — swap token storage, change refresh, replace the identity provider, move from inline claim reads to a real authorization model — has instead become a cross-cutting rewrite because the vendor's types and behaviors leaked everywhere. **This codebase is in transition:** the new Cognito path through [src/auth/](src/auth/) is bounded (one adapter, domain `Principal`-ready types); the legacy Auth0 path through [src/legacy/](src/legacy/) and [src/components/LegacyAdmin.tsx](src/components/LegacyAdmin.tsx) still leaks vendor types throughout. The boundary works where it has been applied; the open work is finishing the migration *and* fixing the storage look-alike on the Cognito side before either is locked in.

## Coverage

- **Comprehensively read** (every relevant region opened): [src/auth/port.ts](src/auth/port.ts), [src/auth/types.ts](src/auth/types.ts), [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts), [src/api/client.ts](src/api/client.ts), [src/components/NewProfile.tsx](src/components/NewProfile.tsx), [src/components/LegacyAdmin.tsx](src/components/LegacyAdmin.tsx), [src/legacy/auth0-helpers.ts](src/legacy/auth0-helpers.ts), [src/lib/firebase-analytics.ts](src/lib/firebase-analytics.ts) (read for imports only — not assessed), plus [package.json](package.json) for vendor identification.
- **Sampled via grep + confirm:** none — the fixture is small enough that every file was read in full. Confirmed by grep that no Auth0 or Amplify import appears outside its expected file(s).
- **Not analyzed or low-confidence:** **`firebase` (`firebase/app`, `firebase/analytics`) is detected as a dependency and imported at [src/lib/firebase-analytics.ts:8](src/lib/firebase-analytics.ts#L8), but no `vendors/firebase.md` profile exists in this skill. Firebase usage is therefore NOT assessed.** Based on the imports observed, Firebase is being used here for analytics, not authentication — but the skill cannot verify this without a Firebase profile. The honest behavior is to record the gap and continue with what can be assessed.

## Boundary assessment

The verdict is **split per vendor** — this codebase is mid-migration, and a single overall verdict would mislead.

### Cognito side — boundary PRESENT (with caveat on storage; see Axis 1)

- **Anti-corruption layer — PRESENT.** Domain types defined at [src/auth/types.ts](src/auth/types.ts). Cognito's `AuthSession`/`AuthTokens` appear only inside [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts). [src/components/NewProfile.tsx](src/components/NewProfile.tsx) consumes only `Principal` — no vendor types in its signature or state.
- **Injected vs imported — PARTIAL.** `AuthPort` exists at [src/auth/port.ts:6](src/auth/port.ts#L6) and the API client receives it by injection at [src/api/client.ts:7](src/api/client.ts#L7). However, [src/components/NewProfile.tsx:9](src/components/NewProfile.tsx#L9) constructs `new CognitoAuthAdapter()` directly instead of receiving it via injection — a missing context/provider layer on this side. Not a hard fail (the boundary still works), but worth noting.
- **Contract-tested — ABSENT.** No `runAuthContractTests`-style suite for the Cognito adapter in this fixture. Migration would have to rely on manual re-verification.
- **Client/server split absorbed — N/A.** No SSR code.

### Auth0 side — boundary ABSENT

- **Anti-corruption layer — ABSENT.** Auth0's `User` and `Auth0Client` types leak directly into application code:
  - [src/legacy/auth0-helpers.ts:7](src/legacy/auth0-helpers.ts#L7) — `getAuth0Client(): Promise<Auth0Client>` returns the vendor client type
  - [src/legacy/auth0-helpers.ts:17](src/legacy/auth0-helpers.ts#L17) — `getLegacyUser(): Promise<User | undefined>` returns the vendor user type
  - [src/components/LegacyAdmin.tsx:9](src/components/LegacyAdmin.tsx#L9) — `useState<User | undefined>` typed with the vendor type
- **Injected vs imported — ABSENT.** Direct Auth0 SDK imports in app code: [src/legacy/auth0-helpers.ts:5](src/legacy/auth0-helpers.ts#L5), [src/components/LegacyAdmin.tsx:5](src/components/LegacyAdmin.tsx#L5). No `AuthPort`-shaped abstraction over Auth0.
- **Contract-tested — ABSENT.** No tests for the Auth0 surface.
- **Client/server split absorbed — N/A.** No SSR code.

A weak boundary on the Auth0 side is precisely why the Auth0-axis findings below are scattered: there is no seam localizing the vendor for the legacy path.

## Findings by axis

Reported per vendor where the surface differs.

### Token storage

#### Cognito side — **Built-in selector, NOT a custom adapter** (look-alike trap)

- **Observation:** [src/auth/adapters/cognito.ts:24](src/auth/adapters/cognito.ts#L24) calls `cognitoUserPoolsTokenProvider.setKeyValueStorage(sessionStorage)`, where `sessionStorage` is imported from `aws-amplify/utils` ([src/auth/adapters/cognito.ts:14](src/auth/adapters/cognito.ts#L14)). Per the Cognito profile: this is a **built-in selector**, not a user-defined class implementing `KeyValueStorageInterface`. Locate→confirm distinction: a grep for `setKeyValueStorage(` finds the call; reading what is *passed* reveals it's a selector, not a custom adapter. Storage is NOT actually swappable from this code.
- **Evidence:** [src/auth/adapters/cognito.ts:14](src/auth/adapters/cognito.ts#L14) (import of the selector); [src/auth/adapters/cognito.ts:24](src/auth/adapters/cognito.ts#L24) (passing it to the storage seam).
- **Recommended seam:** Replace with a user-defined class implementing `KeyValueStorageInterface` (the bounded fixture does this — see the bounded-cognito adapter's `MemoryKeyValueStorage`). Then a storage change (HttpOnly cookies, encrypted store) becomes one file.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

#### Auth0 side — **No storage configured**

- **Observation:** `createAuth0Client` is invoked with only `domain` and `clientId` — no `cache` (Auth0's storage seam), no `cacheLocation` (Auth0's built-in selector), no `useRefreshTokens`. Default behavior: in-memory token cache, refresh via hidden-iframe silent auth.
- **Evidence:** [src/legacy/auth0-helpers.ts:10](src/legacy/auth0-helpers.ts#L10) — minimal config.
- **Recommended seam:** A custom `ICache` implementation if storage swappability matters on the Auth0 side. The bounded-auth0 fixture demonstrates this.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

### Refresh and owned runtime behaviors

#### Cognito side — **Owned ownership shape, partial implementation**

- **Observation:** The adapter implements `onRefresh()` and the API client wires the 401 retry + `onSessionExpired` path. **However, there is no single-flight deduplication** — N concurrent 401s would trigger N refresh calls. The wrapper exists in spirit but not in fact for this fixture.
- **Evidence:** [src/auth/adapters/cognito.ts:46](src/auth/adapters/cognito.ts#L46) (`onRefresh` body), [src/api/client.ts:16](src/api/client.ts#L16) (401 → onRefresh → retry → onSessionExpired). No `refreshOnce`-style wrapper found.
- **Recommended seam:** Add a single-flight helper (`refreshOnce`) and route the adapter's `onRefresh` through it. The bounded-cognito fixture demonstrates this in one small file.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

#### Auth0 side — **Inherited; no ownership**

- **Observation:** Bare `getTokenSilently()` call at [src/legacy/auth0-helpers.ts:25](src/legacy/auth0-helpers.ts#L25) with no 401 interceptor, no single-flight wrapper, no failure path. Refresh is whatever Auth0 does by default.
- **Evidence:** [src/legacy/auth0-helpers.ts:25](src/legacy/auth0-helpers.ts#L25). No 401-handling path on the Auth0 surface anywhere.
- **Recommended seam:** Bring the Auth0 surface behind the same `AuthPort` and wire the 401 path through the API client.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

### Identity provider

#### Cognito side — **Localized**

- **Observation:** Cognito-specific surface (vendor SDK imports, `cognito:groups`, `custom:tenantId`, the storage seam) is confined to [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts). App-layer code (`NewProfile.tsx`, `api/client.ts`) consumes only the domain `Principal`.
- **Evidence:** Grep confirmed no `aws-amplify/*` import outside the adapter, and no Cognito claim name in app code.
- **Recommended seam:** In place. A Cognito → other-provider swap on this side is a new sibling adapter.

#### Auth0 side — **Scattered**

- **Observation:** Auth0-specific surface used directly in two app-layer files.
- **Evidence:**
  - [src/legacy/auth0-helpers.ts:5](src/legacy/auth0-helpers.ts#L5) — `@auth0/auth0-spa-js` imports (`createAuth0Client`, `User`, `Auth0Client`)
  - [src/legacy/auth0-helpers.ts:17](src/legacy/auth0-helpers.ts#L17), [src/legacy/auth0-helpers.ts:25](src/legacy/auth0-helpers.ts#L25) — direct `getUser()`/`getTokenSilently()` calls returning vendor types
  - [src/components/LegacyAdmin.tsx:5](src/components/LegacyAdmin.tsx#L5), [src/components/LegacyAdmin.tsx:9](src/components/LegacyAdmin.tsx#L9), [src/components/LegacyAdmin.tsx:18](src/components/LegacyAdmin.tsx#L18) — direct vendor import, `User` state, inline namespaced-claim URL read
- **Recommended seam:** Bring the Auth0 surface behind the same `AuthPort` (a second adapter implementing the existing port). Two files to migrate.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

### Authorization (and token type)

#### Cognito side — **Bounded shape, partial application**

- **Observation (claims/roles):** The adapter maps `cognito:groups` and `custom:tenantId` to a domain `Principal` at [src/auth/adapters/cognito.ts:35](src/auth/adapters/cognito.ts#L35). However, the fixture does not include a policy layer in this codebase (unlike the bounded-cognito fixture's `policy.ts`), and the sole app-layer consumer ([src/components/NewProfile.tsx](src/components/NewProfile.tsx)) does not exercise authorization decisions — so the policy gap is not load-bearing here, but it would be the moment authorization moved beyond rendering identity fields.
- **Observation (token type):** **Access token** authorizes API calls — [src/auth/adapters/cognito.ts:29](src/auth/adapters/cognito.ts#L29).
- **Recommended seam:** Add the policy module before authorization decisions land in app code.

#### Auth0 side — **Inline claim reads, hard-coded roles, AND Auth0 opaque-token anti-pattern**

- **Observation (claims/roles):** Inline namespaced-claim read and hard-coded role strings in app code.
  - [src/components/LegacyAdmin.tsx:18](src/components/LegacyAdmin.tsx#L18) — `user["https://legacy.example.com/roles"]` read inline
  - [src/components/LegacyAdmin.tsx:20](src/components/LegacyAdmin.tsx#L20) — hard-coded `"admin"` and `"super-admin"` strings
- **Observation (token type — Auth0-specific ANTI-PATTERN):** `createAuth0Client` is invoked with **no `audience` configured**, and `getTokenSilently()` is called with **no audience option**. Per the Auth0 profile: missing `audience` means the returned token is **opaque (non-JWT)**, not a valid API access token — Auth0's documented anti-pattern, typically meaning the app is leaning on the ID token for API auth or sending an opaque blob the backend cannot verify as a JWT.
- **Evidence:** [src/legacy/auth0-helpers.ts:10](src/legacy/auth0-helpers.ts#L10) (no `audience` in config); [src/legacy/auth0-helpers.ts:25](src/legacy/auth0-helpers.ts#L25) (no `audience` option in the call).
- **Recommended seam:** Configure `audience` in the Auth0 client and request it on token calls (the bounded-auth0 adapter demonstrates this). For claim/role coupling: route through the `AuthPort` + domain `Principal` + policy layer (the same gap the Cognito side will hit the moment authz is applied).
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

## Migration-readiness

Not applicable for this run — non-interactive, no maintainer-flagged changes. (For a real audit on this shape, "finish the Auth0 → Cognito migration" would be the natural framing, with the readiness measured against each axis on each side.)

## Prioritized backlog

Not applicable — non-interactive run with no likelihood inputs. No priority ranking can be produced honestly without those. Re-run interactively to get a ranked backlog.

## Judgment calls for you

This codebase has more open questions than a single-vendor run, all maintainer-owned:

- **About the Firebase gap:** Is Firebase on the auth path anywhere in the broader codebase? The imports observed here (`firebase/app`, `firebase/analytics`) suggest no, but the skill cannot verify that without a `firebase` profile. If Firebase Auth or `getAuth()` appears elsewhere, the audit is incomplete.
- **About the migration itself:** What's driving Auth0 → Cognito (cost, compliance, vendor consolidation)? What's the timeline? Both determine whether the Auth0-side findings below are about-to-be-deleted or load-bearing for years.
- **Cognito side specifically:** Is the look-alike storage acceptable for now, or is it on the critical path of a future HttpOnly-cookie move? Should the policy layer land before authz decisions reach app code?
- **Auth0 side specifically:** Is the opaque-token anti-pattern actually breaking something today (if the backend rejects these tokens, this is a current bug, not just calcification), or is the backend accepting them informally?
- **True retrofit cost:** All cost evidence is qualitative. The real time-to-complete depends on team bandwidth and how much of the Auth0 surface lives outside this fixture's analyzed scope.

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** The Auth0 opaque-token observation is a *calcification* finding (token type calcified to "whatever Auth0 returns by default"); whether it constitutes a real security issue depends on backend behavior and is out of scope here.
- **Firebase NOT assessed.** No profile available; the skill is honest about this rather than guessing.
- **App ↔ auth boundary only.** Infrastructure, gateways, IaC out of scope.
- **Findings are evidence-backed observations.** Every `file:line` reference is a clickable link.
- **Cost figures are qualitative** and intended as inputs to *your* time/bandwidth estimate.
