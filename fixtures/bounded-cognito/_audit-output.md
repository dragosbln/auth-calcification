# Authentication Calcification Audit — `fixtures/bounded-cognito`

## Summary

AWS Amplify v6 (Cognito) detected. A real boundary exists: `AuthPort` interface at `src/auth/port.ts`, domain types (`Principal`, `Session`, `AuthError`) defined, vendor types confined to a single adapter file (`src/auth/adapters/cognito.ts`), contract suite present. All four axes are bounded: custom storage adapter via `setKeyValueStorage`, owned 401/refresh with single-flight, Cognito-specific surface localized to the adapter, domain `Principal` + policy layer for authorization, access token for API calls. The system is well-structured for changeability.

## Coverage

**Vendor profile used:**
- `vendors/amplify-cognito.md` (verified against `aws-amplify` v6 as of 2026-06-17)

**Analyzed:**
- 13 TypeScript/TSX files across `src/auth/`, `src/api/`, `src/components/`, `src/pages/`, and `__tests__/`
- `package.json` for vendor identification

**Not analyzed or low-confidence:**
- None. All files parsed successfully. No dynamic imports, no unparseable files, no coverage gaps.

## Boundary assessment

The boundary is **present on all signals measured.**

### Anti-corruption layer: **PRESENT**

Domain types defined at `src/auth/types.ts`:
- `Principal` (lines 4-9) — the app's user vocabulary
- `Session` (lines 11-15) — the app's session shape
- `AuthError` (lines 17-25) — the app's error vocabulary

Vendor types (`AuthSession`, `AuthTokens`, `JWT`) are **confined to `src/auth/adapters/cognito.ts`** and never appear in application-layer signatures. Scanned all components, pages, and the API client — no vendor type leaks found.

**Signal:** The boundary speaks domain types. Callers see `Principal`, never `AuthSession`.

### Injected vs imported: **PRESENT**

`AuthPort` interface exists at `src/auth/port.ts` (lines 6-12). Application code receives auth by injection, not direct import:

- `src/api/client.ts:7` — `createApiClient(auth: AuthPort)` — auth injected as parameter
- `src/auth/context.tsx:17` — `auth: AuthPort` injected into `AuthProvider`
- Components use `useAuth()` hook (lines 31-35), which returns domain `Principal`

No direct imports of `aws-amplify/auth` found outside the adapter.

**Signal:** Auth is a capability, not a singleton. Swappable per execution context; testable with no network.

### Contract-tested: **PRESENT**

Contract suite at `__tests__/auth-contract.test.ts`:
- Lines 16-47: `FakeAuth` — in-memory `AuthPort` implementation (vendor-free)
- Lines 50-97: `runAuthContractTests()` — conformance suite asserting on `AuthPort` methods and domain types only
- Line 100: Suite runs against `FakeAuth`
- Lines 128-131: **Same suite** runs against `CognitoAuthAdapter` (vendor mocked at import boundary)

**Signal:** Migration becomes "make the new adapter pass this suite." The contract is the test surface, not the vendor.

### Client/server split absorbed: **N/A**

No SSR code present in this fixture. (In a real Next.js app with SSR, this would assess whether the same `AuthPort` has client and server adapters, or whether app code branches on execution context.)

**The boundary is real and makes every axis below local.** A storage change touches one file (the adapter's storage config). A provider swap touches one file (write a sibling adapter). A refresh rewrite touches the adapter's `onRefresh` method. The app code is decoupled.

---

## Findings by axis

### Token storage

**Observation:** Custom storage adapter present. Swappable.

**Evidence:**
- `src/auth/adapters/cognito.ts:16-30` — `MemoryKeyValueStorage implements KeyValueStorageInterface` defined
- `src/auth/adapters/cognito.ts:32` — `cognitoUserPoolsTokenProvider.setKeyValueStorage(new MemoryKeyValueStorage())` called

The fixture uses in-memory storage as a demonstration. In a real app, this would be an HttpOnly-cookie-backed implementation or similar. The seam is taken.

**Migration-readiness (if storage change is likely):** You're ~90% there. The storage interface is in place; swapping implementations (e.g., to HttpOnly cookies) means changing lines 16-30 in the adapter. App code is unaffected.

**Likelihood × cost:** See "Judgment calls for you."

---

### Refresh and owned runtime behaviors

**Observation:** Owned refresh with single-flight deduplication and explicit failure path.

**Evidence:**
- `src/auth/refresh.ts:6-13` — `refreshOnce()` single-flight helper
- `src/auth/adapters/cognito.ts:58-66` — `onRefresh()` wraps `fetchAuthSession({ forceRefresh: true })` in `refreshOnce()`
- `src/api/client.ts:19-23` — 401 → `auth.onRefresh()` → retry → `auth.onSessionExpired()` failure path

N concurrent 401s collapse into one refresh call. Failure is explicit, not silent.

**Migration-readiness (if refresh mechanism changes):** You're ~85% there. The 401-retry pattern and single-flight wrapper are in place. Changing *how* refresh works (e.g., calling a server-side refresh endpoint instead of `fetchAuthSession`) touches the adapter's `onRefresh` implementation (lines 58-66). App code is unaffected.

**Likelihood × cost:** See "Judgment calls for you."

---

### Identity provider

**Observation:** Cognito-specific features localized to the adapter.

**Evidence:**
- `src/auth/adapters/cognito.ts:53-54` — `cognito:groups` and `custom:tenantId` claims read **only here**
- `src/auth/adapters/cognito.ts:7` — `cognitoUserPoolsTokenProvider` import (Cognito-specific) **only here**
- App-layer files scanned (`components/`, `pages/`, `api/`) — **zero vendor-specific usage found**

Vendor claim names (`cognito:groups`, `custom:*`) are read in the adapter and mapped to domain `Principal` fields (`roles`, `tenantId`). The rest of the app sees the domain shape only.

**Migration-readiness (if provider swap is likely):** You're ~80% there. To swap Cognito for Auth0 (or another provider):
1. Write a sibling adapter implementing `AuthPort` (one file: `src/auth/adapters/auth0.ts`)
2. Make it pass `runAuthContractTests` (the suite already exists)
3. Swap the adapter instance passed to `AuthProvider`

App code (`components/`, `pages/`, `api/client.ts`) doesn't know the provider is Cognito and wouldn't need to change. The coupling that remains is localized to one adapter file.

**Likelihood × cost:** See "Judgment calls for you."

---

### Authorization (and token type)

**Observation — Claim/role coupling:** Authorization decisions go through a domain policy layer. No inline claim reads in app code.

**Evidence:**
- `src/auth/types.ts:4-9` — domain `Principal` type
- `src/auth/policy.ts:13-16` — `can(principal: Principal, action: Action)` policy function
- `src/auth/adapters/cognito.ts:50-55` — adapter maps vendor claims to `Principal` (claim names appear **only here**)
- `src/components/UserBadge.tsx:12` — `can(principal, "admin.view")` — asks policy, not claim
- `src/components/AdminPanel.tsx:10` — `can(principal, "admin.view")` — asks policy
- `src/pages/Profile.tsx:12-13` — reads `principal.email`, `principal.tenantId` (domain fields)

No hard-coded role strings, no `cognito:groups` reads outside the adapter.

**Observation — Token type:** **Access token** used for API authorization.

**Evidence:**
- `src/auth/adapters/cognito.ts:42` — `session.tokens?.accessToken?.toString()` attached to `Authorization` header (not ID token)

**Migration-readiness (if authorization model changes):** You're ~75% there. The policy layer exists (`src/auth/policy.ts`), so changing authorization logic (e.g., adding finer-grained permissions, moving to RBAC with remote policy checks) touches one file. Moving from ID→access tokens is already done. If the authorization model becomes more complex (e.g., ABAC with attributes), the `Principal` shape and `can()` function would expand, but the app-layer call sites (`can(principal, action)`) wouldn't change structurally.

**Likelihood × cost:** See "Judgment calls for you."

---

## Judgment calls for you

The audit deliberately did not answer the following questions, because only the maintainer can. Answering these would enable likelihood × cost scoring and a prioritized backlog.

### Overall
- **Is a change to any of the four axes actually likely?** The system is well-structured, so the question isn't "can you change it" (you can) but "is there a reason to." Roadmap/org context determines this.

### Token storage
- **Is a storage move coming?** (HttpOnly cookies, compliance, security review finding)

### Refresh and owned runtime behaviors
- **Is a refresh mechanism change coming?** Often tied to storage (HttpOnly cookies break client-side refresh).

### Identity provider
- **Is a provider swap on the table?** If yes, you're ~80% there (write one adapter file). If no, the current structure is defensive but not urgent.

### Authorization (and token type)
- **Is an authorization model change planned?** (RBAC with remote policy, ABAC, finer permissions)
- **What backend contracts depend on the current access-token choice?** If downstream services expect a specific token shape or claim set, that's org/contract complexity, not code.

**The system is well-structured.** A change to any axis is local (one adapter file, or one policy file). Without knowing *which* change is likely, the "prioritized backlog" is empty — there's no urgent remediation, just a well-maintained seam.

If you can answer the questions above and a change is coming, the audit can shift to **migration-readiness framing**: "here's the 15% remaining work to complete the move."

---

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** It assesses changeability. The token storage finding (custom adapter present) says nothing about whether the current in-memory storage is secure for production use — that's a deployment/security question this audit doesn't answer.
- **App ↔ auth boundary only.** Infrastructure, gateways, and IaC were out of scope.
- **Findings are evidence-backed observations.** Every finding includes `file:line` evidence.
