# Authentication Calcification Audit — `fixtures/bounded-auth0`

## Summary

Auth0 SPA SDK detected. A real boundary exists: same `AuthPort` interface, same domain types, same application code as `bounded-cognito` — only the adapter file differs. Vendor types confined to `src/auth/adapters/auth0.ts`, contract suite present (same suite, different vendor mock). All four axes are bounded: custom `ICache` storage adapter, owned 401/refresh with single-flight, Auth0-specific surface (namespaced claims, `audience`, `ICache`) localized to the adapter, domain `Principal` + policy layer, access token for API calls. The system is well-structured for changeability, and the boundary demonstrably travels across providers.

## Coverage

**Vendor profile used:**
- `vendors/auth0.md` (verified against `@auth0/auth0-spa-js` v2 as of 2026-06-17)

**Analyzed:**
- 13 TypeScript/TSX files across `src/auth/`, `src/api/`, `src/components/`, `src/pages/`, and `__tests__/`
- `package.json` for vendor identification

**Not analyzed or low-confidence:**
- None. All files parsed successfully. No dynamic imports, no unparseable files, no coverage gaps.

## Boundary assessment

The boundary is **present on all signals measured.** Structurally identical to `bounded-cognito` — the same nine app-layer files are byte-identical (verified by `diff`). Only the adapter and dependency differ.

### Anti-corruption layer: **PRESENT**

Domain types defined at `src/auth/types.ts` (identical to `bounded-cognito`):
- `Principal` (lines 4-9)
- `Session` (lines 11-15)
- `AuthError` (lines 17-25)

Vendor types (`Auth0Client`, `ICache`, Auth0's `User`) are **confined to `src/auth/adapters/auth0.ts`** and never appear in application-layer signatures. Scanned all components, pages, and the API client — no vendor type leaks found.

**Signal:** The boundary speaks domain types. Callers see `Principal`, never Auth0's `User`. **Same signal as `bounded-cognito`; different vendor underneath.**

### Injected vs imported: **PRESENT**

`AuthPort` interface exists at `src/auth/port.ts` (byte-identical to `bounded-cognito`). Application code receives auth by injection:

- `src/api/client.ts:7` — `createApiClient(auth: AuthPort)` (identical file)
- `src/auth/context.tsx:17` — `auth: AuthPort` injected into `AuthProvider` (identical file)
- Components use `useAuth()` hook (identical files)

No direct imports of `@auth0/auth0-spa-js` found outside the adapter.

**Signal:** Same injection pattern as `bounded-cognito`. The app code doesn't know (and doesn't care) which provider is active.

### Contract-tested: **PRESENT**

Contract suite at `__tests__/auth-contract.test.ts`:
- Lines 16-47: `FakeAuth` (identical to `bounded-cognito`)
- Lines 50-97: `runAuthContractTests()` (identical assertions)
- Line 100: Suite runs against `FakeAuth`
- Lines 115-124: **Same suite** runs against `Auth0AuthAdapter` (vendor mocked at import boundary: `@auth0/auth0-spa-js` instead of `aws-amplify/auth`)

**Portability proof:** The contract suite is identical. The assertions don't know which vendor is underneath. This is what "swap provider = make the new adapter green" means empirically.

### Client/server split absorbed: **N/A**

No SSR code present in this fixture.

**The boundary is real and provider-agnostic.** The fact that nine app files are byte-identical across `bounded-cognito` and `bounded-auth0` is the strongest possible demonstration that the boundary pattern works.

---

## Findings by axis

### Token storage

**Observation:** Custom storage adapter present. Swappable.

**Evidence:**
- `src/auth/adapters/auth0.ts:23-37` — `MemoryCache implements ICache` defined
- `src/auth/adapters/auth0.ts:65` — `cache: new MemoryCache()` passed to `createAuth0Client`

Auth0's storage seam is `ICache` (not Cognito's `KeyValueStorageInterface`), but the pattern is the same: a custom adapter implementing the vendor's storage interface. The fixture uses in-memory storage as a demonstration.

**Note:** Auth0 also has `cacheLocation: 'memory' | 'localstorage'`, which is a **built-in selector**, not a custom adapter (the Auth0 profile's look-alike trap). This fixture uses a real custom `ICache`, not the selector.

**Migration-readiness (if storage change is likely):** You're ~90% there. The storage interface is in place; swapping implementations means changing the `MemoryCache` class (lines 23-37). App code is unaffected.

**Likelihood × cost:** See "Judgment calls for you."

---

### Refresh and owned runtime behaviors

**Observation:** Owned refresh with single-flight deduplication and explicit failure path. Same pattern as `bounded-cognito`.

**Evidence:**
- `src/auth/refresh.ts:6-13` — `refreshOnce()` single-flight helper (identical to `bounded-cognito`)
- `src/auth/adapters/auth0.ts:105-122` — `onRefresh()` wraps `getAccessTokenSilently({ cacheMode: "off" })` in `refreshOnce()`
- `src/api/client.ts:19-23` — 401 → `auth.onRefresh()` → retry → `auth.onSessionExpired()` (identical to `bounded-cognito`)

**Auth0 refresh model note:** Auth0's `getAccessTokenSilently` is more explicit than Amplify's auto-refresh (uses refresh tokens when `useRefreshTokens: true`), but the owned-vs-inherited distinction is the same. The adapter owns the refresh logic; the API client owns the 401 path.

**Migration-readiness (if refresh mechanism changes):** You're ~85% there. The 401-retry pattern is in place and provider-agnostic (same API client code as `bounded-cognito`).

**Likelihood × cost:** See "Judgment calls for you."

---

### Identity provider

**Observation:** Auth0-specific features localized to the adapter.

**Evidence:**
- `src/auth/adapters/auth0.ts:100-101` — namespaced custom claims (`${ns}roles`, `${ns}tenantId`) read **only here**
- `src/auth/adapters/auth0.ts:42-44, 61` — `audience` (Auth0-specific, required for real JWT access tokens) configured **only here**
- `src/auth/adapters/auth0.ts:23-37` — `ICache` interface (Auth0-specific storage seam) **only here**
- App-layer files scanned (`components/`, `pages/`, `api/`) — **zero vendor-specific usage found** (identical files to `bounded-cognito`)

**Auth0 claim model note:** Auth0 silently drops non-namespaced custom claims, so roles/tenantId arrive under full URL keys (`https://example.com/roles`). The adapter maps these to domain `Principal` fields. App code never sees the URL keys.

**Migration-readiness (if provider swap is likely):** Already demonstrated. This fixture **is** the provider swap. The fact that app code didn't change when swapping Cognito → Auth0 proves the boundary is real.

**Likelihood × cost:** See "Judgment calls for you."

---

### Authorization (and token type)

**Observation — Claim/role coupling:** Authorization decisions go through a domain policy layer. No inline claim reads. Identical pattern to `bounded-cognito`.

**Evidence:**
- `src/auth/types.ts:4-9` — domain `Principal` (identical)
- `src/auth/policy.ts:13-16` — `can(principal, action)` (identical)
- `src/auth/adapters/auth0.ts:97-102` — adapter maps Auth0's namespaced claims to `Principal`
- `src/components/UserBadge.tsx:12` — `can(principal, "admin.view")` (identical)
- `src/components/AdminPanel.tsx:10` — `can(principal, "admin.view")` (identical)
- `src/pages/Profile.tsx:12-13` — reads domain fields (identical)

**Observation — Token type:** **Access token** used for API authorization.

**Evidence:**
- `src/auth/adapters/auth0.ts:79` — `getAccessTokenSilently({ authorizationParams: { audience } })` (access token, not ID token)
- `src/auth/adapters/auth0.ts:42-44` — `audience` is required in config (without it, Auth0 returns an opaque token, not a JWT — the documented anti-pattern)

**Migration-readiness (if authorization model changes):** Same as `bounded-cognito` (~75% there). The policy layer exists; app-layer call sites are decoupled from the policy implementation.

**Likelihood × cost:** See "Judgment calls for you."

---

## Judgment calls for you

The audit deliberately did not answer the following questions, because only the maintainer can. Answering these would enable likelihood × cost scoring and a prioritized backlog.

### Overall
- **Is a change to any of the four axes actually likely?** The system is well-structured for changeability, and provider portability has been empirically demonstrated (this fixture is the proof). The question is whether there's a business/roadmap reason to change.

### Token storage
- **Is a storage move coming?** (HttpOnly cookies, compliance, security review finding)

### Refresh and owned runtime behaviors
- **Is a refresh mechanism change coming?** Often tied to storage.

### Identity provider
- **Is another provider swap on the table?** You've already done one (Cognito → Auth0). The same pattern would apply to a future swap (Auth0 → something else).

### Authorization (and token type)
- **Is an authorization model change planned?** (RBAC with remote policy, ABAC, finer permissions)

**The system is well-structured, and the boundary demonstrably works across providers.** Without knowing which change is likely, there's no urgent remediation — just a well-maintained seam that has already proven its value.

---

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** It assesses changeability. Auth0-specific security concerns (e.g., `audience` configuration, refresh token security, PKCE flow correctness) are deployment/security questions this audit doesn't answer.
- **App ↔ auth boundary only.** Infrastructure, gateways, and IaC were out of scope.
- **Findings are evidence-backed observations.** Every finding includes `file:line` evidence.

---

## Portability note

This fixture shares nine files byte-for-byte with `bounded-cognito` (verified by `diff`): `port.ts`, `types.ts`, `refresh.ts`, `policy.ts`, `context.tsx`, `api/client.ts`, `components/*`, `pages/*`. Only the adapter file, `package.json`, and the mocked vendor module in the test differ. **This is the empirical proof that the boundary pattern works:** swap provider = write one adapter file, app code unchanged.
