# Authentication Calcification Audit — `mixed-edge-cases fixture (workspace root, src/)`

**Date:** 2026-07-08
**Vendor profile(s) used:** `amplify-cognito.md` (verified 2026-06-17), `auth0.md` (verified 2026-06-17)
**Model used (self-reported):** Claude Opus 4.7 (claude-opus-4-7)
**Mode:** non-interactive
**Skill version:** 1.3.0
**Machine-readable record:** [auth-calcification-audit.json](auth-calcification-audit.json)

## Summary

This codebase is **mid-migration from Auth0 to Cognito**, and the two surfaces read very differently. The Cognito side has a real boundary — an `AuthPort` interface, an adapter that confines vendor types, an access-token-based `Authorization` header, and a 401-retry path in the injected API client — but three gaps keep it from being fully bounded. The Auth0 legacy path is calcified: `User`/`Auth0Client` types cross into a component and the facade, a namespaced-claim URL key is read inline, and API calls authorize with an opaque token (`getTokenSilently()` with no `audience` — the documented Auth0 anti-pattern). Firebase is present in `package.json` for analytics; there is no `vendors/firebase.md` profile, so it is deliberately **not** assessed — flagged as a coverage gap rather than silently declared clean.

Because this run is non-interactive, no maintainer likelihood inputs were captured. All four axis prioritization questions are routed to *Judgment calls for you*; there is no prioritized backlog in this report.

## What auth calcification means (for this codebase)

Auth calcification is the degree to which a change that should be local — swap token storage, change refresh, replace the identity provider, move from inline claim reads to a real authorization model — has instead become a cross-cutting rewrite because the vendor's types and behaviors have leaked everywhere.

This codebase sits **in transition**. The new path through [src/auth/](src/auth/) is mostly bounded — types are domain-owned, the adapter confines Cognito's shape, the API client depends on the injected port. The legacy path through [src/legacy/](src/legacy/) and [src/components/LegacyAdmin.tsx](src/components/LegacyAdmin.tsx) still leaks Auth0's vendor types and reads namespaced claims inline. The boundary works where it has been applied; the open work is finishing the migration (or, if Auth0 is staying, applying the same boundary treatment to it) plus closing three specific gaps on the Cognito side.

## Coverage

- **Comprehensively read** (every relevant region opened): [package.json](package.json), [src/auth/types.ts](src/auth/types.ts), [src/auth/port.ts](src/auth/port.ts), [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts), [src/api/client.ts](src/api/client.ts), [src/components/NewProfile.tsx](src/components/NewProfile.tsx), [src/legacy/auth0-helpers.ts](src/legacy/auth0-helpers.ts), [src/components/LegacyAdmin.tsx](src/components/LegacyAdmin.tsx), [src/lib/firebase-analytics.ts](src/lib/firebase-analytics.ts). Each was read in full — the audited scope is small enough that no sampling was necessary.
- **Sampled via grep + confirm:** none — every source file was read comprehensively.
- **Not analyzed or low-confidence:**
  - **Firebase v10.7.0** ([src/lib/firebase-analytics.ts](src/lib/firebase-analytics.ts)) is present in `package.json` and imported (`firebase/app`, `firebase/analytics`), but no `vendors/firebase.md` profile is available. Usage in this repo appears to be analytics, not auth — but the skill cannot verify that or assess any auth risk safely without a profile. **Not assessed**, and NOT silently dropped.
  - **No test files exist** under the audited scope ([src/](src/)) — no `*.test.ts` / `*.spec.ts` / `__tests__/` / `test/` directories. The B3 verdict of "absent" below therefore reflects the absence of tests entirely, not just the absence of contract-shaped tests.

## Boundary assessment

The structural finding that frames every axis: the Cognito side has a real boundary with two gaps; the Auth0 side has no boundary at all. A single overall verdict would be wrong — the assessment is split per vendor.

**Cognito side**

- **Anti-corruption layer — PRESENT.** A domain `Principal` at [src/auth/types.ts:3](src/auth/types.ts#L3) is used by the new component at [src/components/NewProfile.tsx:8](src/components/NewProfile.tsx#L8); Cognito's own session/user/JWT types do not appear outside [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts).
- **Injected vs imported — PRESENT.** [src/auth/port.ts:6](src/auth/port.ts#L6) defines `AuthPort`; [src/api/client.ts:6](src/api/client.ts#L6) takes it as a parameter (`createApiClient(auth: AuthPort)`), and app code calls only through the port.
- **Contract-tested — ABSENT.** No tests exist at all (see Coverage). The port shape is not exercised independently of the vendor. The boundary is structurally present but not defended by a suite.
- **Client/server split absorbed — NOT APPLICABLE.** No SSR/server surface exists (no `aws-amplify/auth/server`, no `@aws-amplify/adapter-nextjs`, no `createServerRunner`). The concern does not arise here — recorded as a determined fact, not an unknown.

**Auth0 side**

- **Anti-corruption layer — ABSENT.** Vendor types cross the boundary: the legacy facade returns `Auth0Client` at [src/legacy/auth0-helpers.ts:9](src/legacy/auth0-helpers.ts#L9) and `User` at [src/legacy/auth0-helpers.ts:21](src/legacy/auth0-helpers.ts#L21); a component uses Auth0's `User` type as its own state at [src/components/LegacyAdmin.tsx:9](src/components/LegacyAdmin.tsx#L9).
- **Injected vs imported — ABSENT.** Direct `@auth0/auth0-spa-js` imports at [src/legacy/auth0-helpers.ts:5](src/legacy/auth0-helpers.ts#L5) and [src/components/LegacyAdmin.tsx:5](src/components/LegacyAdmin.tsx#L5); no injected port on this surface.
- **Contract-tested — ABSENT.** No tests (same coverage note).
- **Client/server split absorbed — NOT APPLICABLE.** No `@auth0/nextjs-auth0` server surface; the concern does not arise.

The two visible gaps in the otherwise-present Cognito boundary — no contract suite and (below) no single-flight refresh — are the reason the Cognito axes below still cost something to close. On the Auth0 side, the absence of the boundary itself is the reason its axes cost more, and it makes every axis compound: fixing storage there without a boundary means every current and future consumer touches storage.

## Findings by axis

### Token storage

- **Observation (Cognito):** **Built-in selector, not a custom adapter.** [src/auth/adapters/cognito.ts:22](src/auth/adapters/cognito.ts#L22) calls `cognitoUserPoolsTokenProvider.setKeyValueStorage(sessionStorage)` where `sessionStorage` is imported from `aws-amplify/utils` at [src/auth/adapters/cognito.ts:13](src/auth/adapters/cognito.ts#L13). This is Amplify v6's persistence selector, **not** a class implementing `KeyValueStorageInterface`. It flips session-vs-local storage but does not own storage — tokens remain vendor-managed and JS-readable. The profile explicitly names this the look-alike trap.
- **Observation (Auth0):** No `cache` (custom `ICache`) is passed to `createAuth0Client` and no `cacheLocation` is set; the SDK falls back to its in-memory default. Verified by searching [src/legacy/auth0-helpers.ts](src/legacy/auth0-helpers.ts), [src/components/](src/components/), and [src/](src/) for `cache:`, `cacheLocation:`, `ICache`, `LocalStorageCache`, `InMemoryCache`, and `useRefreshTokens:`.
- **Recommended seam:** A domain storage interface fronted by the boundary. For Cognito, a user-defined class implementing `KeyValueStorageInterface` (from `aws-amplify/utils`), passed to `setKeyValueStorage` — the same call site, with a different argument type. For Auth0, a class implementing `ICache` (from `@auth0/auth0-spa-js`), passed via the `cache:` option on `createAuth0Client`. Application code depends only on the domain interface.
- **Cost evidence:** *low.* Cognito storage is one wire in a single adapter file; swapping the selector for a user-defined class is a local edit inside the boundary. Auth0 storage is not configured at all — becoming owned means adding `cache:` at one call site. The Cognito boundary already keeps consumers from touching storage directly; the Auth0 side has no such shielding, so any Auth0 storage change first has to route through a new boundary before it becomes local.
- **Likelihood:** see *Judgment calls*.

### Refresh and owned runtime behaviors

- **Observation (Cognito):** **Partially owned.** [src/api/client.ts:18](src/api/client.ts#L18) implements a 401-retry against `auth.onRefresh()`, and [src/auth/adapters/cognito.ts:47](src/auth/adapters/cognito.ts#L47) drives it with `fetchAuthSession({ forceRefresh: true })`; the failure path throws `AuthError("session expired", "session-expired")` at [src/auth/adapters/cognito.ts:55](src/auth/adapters/cognito.ts#L55). Missing: single-flight dedup — N concurrent 401s each call `onRefresh` independently. Searched the port, adapter, and API client for `refreshPromise`, in-flight caches, mutexes, and Hub coordination; none present.
- **Observation (Auth0):** **Inherited.** [src/legacy/auth0-helpers.ts:31](src/legacy/auth0-helpers.ts#L31) returns `c.getTokenSilently()` bare — no interceptor, no dedup, no explicit failure route. Refresh is inherited from Auth0's silent-refresh mechanism (in-memory cache + hidden-iframe silent auth by default).
- **Recommended seam:** For Cognito, keep the existing 401-retry pattern and add a single-flight refresh promise on the adapter (concurrent 401s await the same in-flight refresh). For Auth0, route the legacy facade's token acquisition through an `AuthPort` on the same API client so the 401/single-flight/failure path is shared across vendors — or, if the legacy path is dying, retire it as the migration completes rather than owning refresh there.
- **Cost evidence:** *moderate.* Cognito is close to owned — the interceptor and failure path exist and single-flight is one field plus a promise-caching guard on the adapter. Auth0's inherited path is called from one facade file, but the retrofit isn't `getTokenSilently` itself — every caller of `getLegacyToken` needs to move onto the port to escape the inherited behavior; the cost scales with how many callers exist outside the audited surface.
- **Likelihood:** see *Judgment calls*.

### Identity provider

- **Observation (Cognito):** **Localized.** Cognito-specific claim keys (`cognito:groups`, `custom:tenantId`) appear only inside the adapter at [src/auth/adapters/cognito.ts:40](src/auth/adapters/cognito.ts#L40) and [src/auth/adapters/cognito.ts:41](src/auth/adapters/cognito.ts#L41), and are mapped onto `Principal.tenantId` and `Principal.roles`. No component or route reads a `cognito:*` key.
- **Observation (Auth0):** **Scattered.** [src/components/LegacyAdmin.tsx:17](src/components/LegacyAdmin.tsx#L17) reads Auth0's namespaced custom-claim URL key inline; the component's state is typed as Auth0's `User` at [src/components/LegacyAdmin.tsx:9](src/components/LegacyAdmin.tsx#L9); the facade returns Auth0's `User` and `Auth0Client` types ([src/legacy/auth0-helpers.ts:9](src/legacy/auth0-helpers.ts#L9), [src/legacy/auth0-helpers.ts:21](src/legacy/auth0-helpers.ts#L21)). Provider-specific coupling has spread beyond any adapter.
- **Recommended seam:** All vendor-specific claim reads confined to per-vendor adapters — Cognito's `cognito:*`/`custom:*` and Auth0's namespaced URL keys — each projecting onto the domain `Principal`. App code speaks `Principal` only; no component ever names a Cognito or Auth0 claim key. In this codebase the Cognito adapter already exemplifies the pattern; the work is applying it to Auth0.
- **Cost evidence:** *moderate.* Cognito's provider-specific surface is fully localized to one file. Auth0's confirmed leak count is small in this fixture (one inline namespaced-claim read, one `User`-typed component, one facade returning `User`/`Auth0Client`), but the retrofit is per component-touch, not per adapter. Cost scales with how many Auth0-consuming files exist elsewhere; the pattern is the calcification, not the count.
- **Likelihood:** see *Judgment calls*.

### Authorization (and token type)

- **Observation (Cognito):** **Principal-without-policy, access token used for API.** The adapter attaches the access token (not the ID token) via [src/auth/adapters/cognito.ts:28](src/auth/adapters/cognito.ts#L28) and [src/auth/adapters/cognito.ts:29](src/auth/adapters/cognito.ts#L29), and maps `cognito:groups` to `Principal.roles` at [src/auth/adapters/cognito.ts:41](src/auth/adapters/cognito.ts#L41). But no policy layer wraps authorization decisions — no `can(...)`, `hasRole`, `authorize`, or similar helpers anywhere in [src/](src/). The new components don't currently check roles, so no inline reads exist yet — nothing has calcified — but nothing prevents future components from reading `Principal.roles` inline, either.
- **Observation (Auth0):** **Inline reads, opaque token.** [src/components/LegacyAdmin.tsx:19](src/components/LegacyAdmin.tsx#L19) checks hard-coded role strings inline (`roles.includes("admin") || roles.includes("super-admin")`) after reading the namespaced claim at [src/components/LegacyAdmin.tsx:17](src/components/LegacyAdmin.tsx#L17). Separately, [src/legacy/auth0-helpers.ts:31](src/legacy/auth0-helpers.ts#L31) calls `getTokenSilently()` with **no `audience`** anywhere in the codebase — per the Auth0 profile, this yields an opaque (non-JWT) token that is not a valid API access token. This is the documented Auth0 anti-pattern; it signals that API calls authorized by `getLegacyToken` are relying on the ID token or a non-validating API for authorization.
- **Recommended seam:** A single policy layer, e.g. `can(principal, action, resource)`, called from app code and backed by `Principal` alone. Both adapters project vendor claims onto `Principal`; no component reads vendor-specific claim shapes; no component knows the role string vocabulary. For Auth0 specifically: pass `authorizationParams: { audience: <api-identifier> }` to `getAccessTokenSilently` (v2 shape) so the SDK returns a real JWT access token — then send that token, not the ID token. *(Illustration only, not a patch — the audit does not edit auth code.)*
- **Cost evidence:** *high.* Two independent problems compound. First, the opaque-token anti-pattern is systemic — every API call authorized by `getLegacyToken` is authenticating with a non-JWT token; adding `audience` requires an API identifier decision, backend acceptance of the new audience, and re-consenting scopes. Second, there is no shared policy layer on either side; unification means projecting two vendors' claims onto `Principal`, introducing an authorization function, AND migrating each inline role check through it.
- **Likelihood:** see *Judgment calls*.

## Migration-readiness

Not applicable in this run: no change was flagged by the maintainer (non-interactive mode). *Migration-readiness* is populated when the maintainer names the specific change on the table for an axis; without that input, the audit deliberately does not read the findings forward.

## Prioritized backlog

Not produced. Prioritization requires the maintainer's likelihood input — which axes matter enough to invest in. In non-interactive mode there is no likelihood input to rank against, so no backlog is generated. See *Judgment calls for you* below for the questions that would drive it.

## Judgment calls for you

The questions the audit deliberately did not answer, because only the maintainer can.

1. **Storage.** Is a token storage change (HttpOnly cookies, encrypted store, shared token store) actually on the roadmap for either vendor's surface? Cognito is one wire from a custom adapter (built-in selector today, look-alike trap at [src/auth/adapters/cognito.ts:22](src/auth/adapters/cognito.ts#L22)); Auth0 has no storage configured. Whether either matters depends on your storage goals.
2. **Refresh.** Is owning refresh (401-interceptor + single-flight + explicit failure path) on the roadmap, independent of any storage change? Cognito refresh is already partially owned — single-flight (see [src/api/client.ts:18](src/api/client.ts#L18) and [src/auth/adapters/cognito.ts:47](src/auth/adapters/cognito.ts#L47)) is the visible gap. Auth0 refresh is inherited via `getTokenSilently` and travels through the legacy facade at [src/legacy/auth0-helpers.ts:31](src/legacy/auth0-helpers.ts#L31).
3. **Identity provider.** Is finishing the Auth0 → Cognito migration realistic in the next 12–24 months, or is Auth0 staying indefinitely? The "right" scope of remediation on the Auth0 side depends on whether the legacy code is dying. If Auth0 is staying, its calcification (see [src/components/LegacyAdmin.tsx](src/components/LegacyAdmin.tsx) and [src/legacy/auth0-helpers.ts](src/legacy/auth0-helpers.ts)) needs the same boundary treatment as Cognito; if it's exiting soon, the migration completion IS the remediation.
4. **Authorization.** Are authorization model changes (RBAC/ABAC, finer permissions) planned — and, separately, is the ID→access-token fix for Auth0 already being tracked? The Auth0 opaque-token issue at [src/legacy/auth0-helpers.ts:31](src/legacy/auth0-helpers.ts#L31) is independent of any broader authz change and moves at its own cadence (backend acceptance, audience assignment, scope consent). A policy layer would unify Cognito ([src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts)) and Auth0 authorization, but only pays off if either the model is changing or the migration is completing.
5. **Unprofiled vendor (Firebase).** Firebase is in `package.json` and imported for analytics at [src/lib/firebase-analytics.ts](src/lib/firebase-analytics.ts) — is Firebase Auth used anywhere the audit didn't cover (a mobile client, an admin surface, another repo)? If so, a `vendors/firebase.md` profile should be authored so a future run can assess it. The skill deliberately did not assess Firebase because no profile exists.
6. **True retrofit cost.** What is the true retrofit cost per axis in your team's context — bandwidth, test coverage, coordination with backend on the Auth0 audience/scope decision? The audit reports mechanical cost (low/moderate/high) grounded in boundary quality and confirmed call-site counts. Time-to-complete depends on team, tests, and coordination — that number is yours.

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** It assesses changeability, not vulnerabilities. The opaque-token finding for Auth0 is called out because the *profile documents it as a calcification anti-pattern* (the app is coupled to an ID-token-for-API design), not as a security verdict — get a real security review for auth-related vulnerabilities.
- App↔auth boundary only; infrastructure, gateways, and IaC were out of scope. Firebase was in scope structurally but not assessed (no profile) — flagged in Coverage.
- Findings are evidence-backed observations; no prioritization is offered because no maintainer input was captured (non-interactive mode).
- **Cost figures are qualitative (low/moderate/high) and based on mechanical evidence.** Real time-to-complete depends on test coverage, team bandwidth, and per-app call-site reality you know best — confirm before committing to sequencing.
