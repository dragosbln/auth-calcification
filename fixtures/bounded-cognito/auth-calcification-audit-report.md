# Authentication Calcification Audit — `fixtures/bounded-cognito`

**Date:** 2026-06-20
**Vendor profile(s) used:** `amplify-cognito.md` (verified against `aws-amplify` v6 as of 2026-06-17)
**Model used (self-reported):** Claude Opus 4.7
**Mode:** non-interactive

## Summary

AWS Amplify v6 / Cognito. **A real boundary exists and is enforced.** An `AuthPort` interface ([src/auth/port.ts](src/auth/port.ts)) defines the contract; a single adapter ([src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts)) is the only file that imports `aws-amplify`; vendor types never appear in application-layer signatures. All four axes are bounded: a custom storage adapter implements `KeyValueStorageInterface`, refresh is owned with single-flight, Cognito-specific claim reads are localized to the adapter, the access token (not the ID token) authorizes API calls, and a contract suite runs the *same* assertions against the real adapter and a `FakeAuth` test double.

## What auth calcification means (for this codebase)

Auth calcification is the degree to which a change that should be local — swap token storage, change refresh, replace the identity provider, move from inline claim reads to a real authorization model — has instead become a cross-cutting rewrite because the vendor's types and behaviors leaked everywhere. **This codebase is well-bounded:** an `AuthPort` interface, vendor types confined to one adapter, a domain `Principal` with a single policy layer, and a contract suite that tests the boundary itself. Any of the four future changes below stays local to one or two files — a provider swap is a new sibling adapter that passes the same contract suite.

## Coverage

- **Comprehensively read** (every relevant region opened): [src/auth/port.ts](src/auth/port.ts), [src/auth/types.ts](src/auth/types.ts), [src/auth/refresh.ts](src/auth/refresh.ts), [src/auth/policy.ts](src/auth/policy.ts), [src/auth/context.tsx](src/auth/context.tsx), [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts), [src/api/client.ts](src/api/client.ts), [src/components/UserBadge.tsx](src/components/UserBadge.tsx), [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx), [src/pages/Profile.tsx](src/pages/Profile.tsx), [__tests__/auth-contract.test.ts](__tests__/auth-contract.test.ts), plus [package.json](package.json).
- **Sampled via grep + confirm:** none — the fixture is small enough that every file was read in full. Confirmed by grep that no `aws-amplify` import appears outside the adapter, and that no `cognito:` / `custom:` claim name appears outside the adapter.
- **Not analyzed or low-confidence:** none. All files parsed; no dynamic imports; no detected-but-unprofiled vendors.

## Boundary assessment

The boundary is **PRESENT on all four signals**.

- **Anti-corruption layer — PRESENT.** Domain types (`Principal`, `Session`, `AuthError`) defined at [src/auth/types.ts](src/auth/types.ts). Vendor types (`AuthSession`, `JWT`, Cognito payload shapes) appear only inside [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts). Every app-layer file ([src/components/UserBadge.tsx](src/components/UserBadge.tsx), [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx), [src/pages/Profile.tsx](src/pages/Profile.tsx), [src/api/client.ts](src/api/client.ts), [src/auth/context.tsx](src/auth/context.tsx)) traffics in `Principal` and `AuthPort`, never `AuthSession`. Confirmed by reading every signature.

- **Injected vs imported — PRESENT.** An `AuthPort` contract exists at [src/auth/port.ts:6](src/auth/port.ts#L6). The API client receives the port by injection ([src/api/client.ts:7](src/api/client.ts#L7) — `createApiClient(auth: AuthPort)`). The React layer injects via context ([src/auth/context.tsx:13](src/auth/context.tsx#L13)) so components consume `useAuth()` rather than importing the vendor. No `aws-amplify` import outside the single adapter file.

- **Contract-tested — PRESENT.** A reusable conformance suite `runAuthContractTests` lives at [__tests__/auth-contract.test.ts:50](__tests__/auth-contract.test.ts#L50). It is run against `FakeAuth` ([__tests__/auth-contract.test.ts:100](__tests__/auth-contract.test.ts#L100)) AND against the real `CognitoAuthAdapter` with the vendor SDK mocked at the import boundary ([__tests__/auth-contract.test.ts:128](__tests__/auth-contract.test.ts#L128)). The assertions are on the `AuthPort` contract and the domain `Principal` shape — never on vendor-specific keys. Migration to a new provider becomes "make a new adapter pass this suite."

- **Client/server split absorbed — N/A.** No SSR code in this fixture. (In a real Next.js codebase the same `AuthPort` would be implemented by client and server adapters; the contract suite would run against both.)

## Findings by axis

### Token storage

- **Observation:** Custom storage adapter. The fixture defines `MemoryKeyValueStorage` implementing `KeyValueStorageInterface` and registers it via `cognitoUserPoolsTokenProvider.setKeyValueStorage(...)`. This is a real custom adapter, not the look-alike trap (a built-in `defaultStorage`/`sessionStorage`/`new CookieStorage()`). Storage is swappable — to move to HttpOnly cookies or an encrypted store, replace this single class.
- **Evidence:** [src/auth/adapters/cognito.ts:16](src/auth/adapters/cognito.ts#L16) (class definition implementing `KeyValueStorageInterface`); [src/auth/adapters/cognito.ts:32](src/auth/adapters/cognito.ts#L32) (registration via `setKeyValueStorage`).
- **Recommended seam:** The seam is in place. (If Cognito Identity Pools were in use, the `IdentityIdStore` would still default to `localStorage` — out of scope for this fixture, but worth noting in a real audit.)
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

### Refresh and owned runtime behaviors

- **Observation:** Owned refresh with single-flight deduplication and explicit failure path.
- **Evidence:**
  - Single-flight wrapper at [src/auth/refresh.ts:6](src/auth/refresh.ts#L6) — N concurrent 401s collapse into one refresh
  - Owned 401 path at [src/api/client.ts:19](src/api/client.ts#L19) — `if (res.status === 401 && (await auth.onRefresh())) { res = await call(); }`, then `auth.onSessionExpired()` if still 401
  - Adapter wires the refresh through the single-flight helper at [src/auth/adapters/cognito.ts:58](src/auth/adapters/cognito.ts#L58) — `refreshOnce(...)` calling `fetchAuthSession({ forceRefresh: true })`
- **Recommended seam:** In place. (Sibling owned behaviors — sign-out propagation, multi-tab session sync — are not implemented here; the fixture is deliberately scoped to refresh as the lead example.)
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

### Identity provider

- **Observation:** Cognito-specific surface (vendor SDK imports, claim names, custom-attribute reads, the `setKeyValueStorage` storage seam) is **localized to a single adapter file**. App code consumes only the domain `Principal`.
- **Evidence:** [src/auth/adapters/cognito.ts:6](src/auth/adapters/cognito.ts#L6) is the only file importing `aws-amplify/*`. `cognito:groups` and `custom:tenantId` reads appear only at [src/auth/adapters/cognito.ts:53](src/auth/adapters/cognito.ts#L53). All other files consume `Principal.roles`, `Principal.tenantId`, etc.
- **Recommended seam:** In place. A provider swap is a new sibling adapter implementing `AuthPort` and passing the contract suite — app code does not change.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

### Authorization (and token type)

- **Observation (claims/roles):** Bounded. Vendor claims are mapped to a domain `Principal` inside the adapter; authorization decisions go through a single policy layer (`can(principal, action)`). No inline claim reads or hard-coded role strings in application code.
- **Observation (token type):** **Access token** authorizes API calls (not the ID token).
- **Evidence (claims/roles):**
  - Domain mapping inside the adapter at [src/auth/adapters/cognito.ts:50](src/auth/adapters/cognito.ts#L50) — `cognito:groups` → `Principal.roles`, `custom:tenantId` → `Principal.tenantId`
  - Single policy layer at [src/auth/policy.ts:13](src/auth/policy.ts#L13) — `can(principal, action)`
  - App-layer usage of the policy at [src/components/AdminPanel.tsx:10](src/components/AdminPanel.tsx#L10) and [src/components/UserBadge.tsx:12](src/components/UserBadge.tsx#L12) — `can(principal, "admin.view")`, not inline group reads
- **Evidence (token type):** [src/auth/adapters/cognito.ts:42](src/auth/adapters/cognito.ts#L42) — `session.tokens?.accessToken?.toString()` attached to the header.
- **Recommended seam:** In place. To add finer-grained permissions (move toward RBAC/ABAC), extend `Principal` and the policy module without touching components — the model change is local.
- **Likelihood × cost:** See "Judgment calls for you" — non-interactive run.

## Migration-readiness

Not applicable for this run — non-interactive, no maintainer-flagged changes. The structural readiness is high across the board (boundary present, custom storage, owned refresh, policy layer, access token, contract suite); for any of the four axes the maintainer might flag, the remaining work would be small and local.

## Prioritized backlog

Not applicable — non-interactive run with no likelihood inputs. No priority ranking can be produced honestly without those. Re-run interactively to get a ranked backlog.

## Judgment calls for you

Even with a fully bounded shape, only you can answer:

- **Token storage** — Is a move off the current adapter implementation actually planned (e.g., to HttpOnly cookies, encrypted store)? The seam is ready; the question is whether to invest in the new implementation.
- **Refresh ownership** — Are sibling behaviors (sign-out propagation, multi-tab sync, silent re-auth) on the roadmap? The boundary makes them straightforward to add via the `AuthPort`, but they aren't implemented today.
- **Identity provider** — Is a provider swap realistic, or is the value of decoupling purely defensive optionality? The bounded shape makes a swap genuinely cheap — but cheap is not the same as worth doing.
- **Authorization model** — Is RBAC/ABAC or finer permissions planned? The policy layer makes the model change local; the question is whether the model change itself is on the roadmap.
- **True retrofit cost** — All findings above are structural ("seam present", "single file"). The real time-to-complete for any change depends on team bandwidth and test coverage you know best.

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** It assesses changeability, not vulnerabilities. The custom storage adapter here is in-memory for fixture purposes; a production deployment should use a storage backend appropriate to the threat model — that decision is out of scope here.
- **App ↔ auth boundary only.** Infrastructure, API gateways, Lambda authorizers, IaC out of scope.
- **Findings are evidence-backed observations.** Every `file:line` reference is a clickable link.
- **Cost figures are qualitative** (low/moderate/high anchored to mechanical evidence) and intended as inputs to *your* time/bandwidth estimate, not as a substitute for it.
