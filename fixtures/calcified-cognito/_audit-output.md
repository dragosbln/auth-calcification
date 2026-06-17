# Authentication Calcification Audit — `fixtures/calcified-cognito`

## Summary

AWS Amplify v6 (Cognito) detected. No real boundary exists — a `lib/auth-helpers.ts` module appears to be a wrapper but is a **leaky facade** (returns vendor types directly). Vendor types, imports, and claim names are scattered across 5 application files. All four axes are inherited or scattered: default localStorage storage, bare vendor refresh with no owned 401-handling, Cognito-specific features in app code, inline claim reads in 3 files, and ID token used for API authorization. The system is calcified.

## Coverage

**Vendor profile used:**
- `vendors/amplify-cognito.md` (verified against `aws-amplify` v6 as of 2026-06-17)

**Analyzed:**
- 7 TypeScript/TSX files: `__tests__/auth.test.ts`, `src/api/client.ts`, `src/components/AdminPanel.tsx`, `src/components/UserBadge.tsx`, `src/lib/amplify-config.ts`, `src/lib/auth-helpers.ts`, `src/pages/Profile.tsx`
- `package.json` for vendor identification

**Not analyzed or low-confidence:**
- None. All files parsed successfully. No dynamic imports, no unparseable files, no coverage gaps.

## Boundary assessment

The boundary is **absent on all four signals**. The `src/lib/auth-helpers.ts` module looks like a boundary by name but is a leaky facade — it re-exports vendor functions and returns vendor types unchanged, so the vendor's shape passes through to every caller.

### Anti-corruption layer: **ABSENT**

Vendor types leak into application-layer signatures and state in 5 locations:

1. `src/lib/auth-helpers.ts:8` — `getSession(): Promise<AuthSession>` — exported function returns vendor type
2. `src/lib/auth-helpers.ts:14` — `getUser(): Promise<AuthUser>` — exported function returns vendor type
3. `src/components/UserBadge.tsx:11` — `useState<AuthSession | null>` — component state typed as vendor type
4. `src/components/UserBadge.tsx:33` — `getCurrentSession(): Promise<AuthSession>` — exported function returns vendor type
5. `src/pages/Profile.tsx:12` — `useState<FetchUserAttributesOutput | null>` — page state typed as vendor type

The "wrapper" at `src/lib/auth-helpers.ts` is not a real boundary. It hands vendor types directly to callers, coupling every caller to Amplify's `AuthSession` and `AuthUser` shapes.

### Injected vs imported: **ABSENT**

Auth is accessed via direct vendor imports scattered across 5 files. No `AuthPort`-style interface exists; no injection.

1. `src/api/client.ts:7` — `import { fetchAuthSession } from 'aws-amplify/auth'`
2. `src/components/UserBadge.tsx:8` — `import { fetchAuthSession, AuthSession } from "aws-amplify/auth"`
3. `src/components/AdminPanel.tsx:7` — `import { fetchAuthSession } from "aws-amplify/auth"`
4. `src/pages/Profile.tsx:6-9` — `import { fetchUserAttributes, FetchUserAttributesOutput } from "aws-amplify/auth"`
5. `src/lib/auth-helpers.ts:6` — vendor imports in the wrapper module

### Contract-tested: **ABSENT**

No contract suite. The test mocks the vendor directly and asserts on vendor shape.

1. `__tests__/auth.test.ts:9-11` — mocks `aws-amplify/auth`
2. `__tests__/auth.test.ts:15-23` — `mockResolvedValue` provides Amplify's `AuthSession` shape
3. `__tests__/auth.test.ts:27-30` — assertions against vendor claim structure (`cognito:groups`)

**Consequence:** These tests pass today and will die on migration. No conformance suite exists to make a new adapter testable.

### Client/server split absorbed: **N/A**

No SSR code present in this fixture.

**The weak boundary is the root cause.** Every axis below is expensive to change precisely because there is no seam localizing the vendor. A provider swap, a storage change, a refresh rewrite — all would touch scattered call sites instead of one adapter file.

---

## Findings by axis

### Token storage

**Observation:** Default `localStorage` storage. No custom storage adapter.

**Evidence:**
- `src/lib/amplify-config.ts:5-12` — `Amplify.configure()` called with no `setKeyValueStorage` anywhere in codebase
- No imports of `cognitoUserPoolsTokenProvider` or `KeyValueStorageInterface` found

**Recommended seam:**
```ts
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import type { KeyValueStorageInterface } from 'aws-amplify/utils';

class CustomStorage implements KeyValueStorageInterface {
  async setItem(key: string, value: string) { /* ... */ }
  async getItem(key: string) { /* ... */ }
  async removeItem(key: string) { /* ... */ }
  async clear() { /* ... */ }
}

cognitoUserPoolsTokenProvider.setKeyValueStorage(new CustomStorage());
```

Swapping storage becomes changing the `CustomStorage` implementation, localized to one file.

**Likelihood × cost:** See "Judgment calls for you."

---

### Refresh and owned runtime behaviors

**Observation:** Bare `fetchAuthSession()` with no 401-handling, no single-flight deduplication, no explicit failure path. Refresh is inherited vendor magic.

**Evidence:**
- `src/api/client.ts:14` — `fetchAuthSession()` called in axios interceptor with NO:
  - 401 → retry logic
  - Single-flight wrapper (N concurrent 401s would trigger N refresh attempts)
  - Explicit `onSessionExpired` failure path

**Recommended seam:**
```ts
// Single-flight helper
let inflight: Promise<boolean> | null = null;
export function refreshOnce(doRefresh: () => Promise<boolean>) {
  inflight ??= doRefresh().finally(() => { inflight = null; });
  return inflight;
}

// 401 interceptor
let res = await call();
if (res.status === 401 && (await auth.onRefresh())) {
  res = await call();  // retry once
}
if (res.status === 401) {
  auth.onSessionExpired();  // explicit failure
}
```

**Consequence:** Silent auto-refresh depends on browser-readable tokens. Breaks on a move to HttpOnly cookies.

**Likelihood × cost:** See "Judgment calls for you."

---

### Identity provider

**Observation:** Cognito-specific features scattered across 3 application-layer files. Not localized to an adapter.

**Evidence:**
1. `src/components/UserBadge.tsx:18` — `payload["cognito:groups"]` read inline
2. `src/components/UserBadge.tsx:19-20` — `payload["cognito:username"]` read inline
3. `src/components/AdminPanel.tsx:15` — `payload["cognito:groups"]` read inline **(2nd occurrence — scattered)**
4. `src/pages/Profile.tsx:7` — `fetchUserAttributes()` (Cognito-only API) called from page layer
5. `src/pages/Profile.tsx:19` — `["custom:tenantId"]` (Cognito custom attribute) read inline

**Spread:** 3 files (UserBadge, AdminPanel, Profile). A provider swap would require editing all three.

**Recommended seam:** Localize vendor-specific usage to a single adapter file. App code speaks domain types only.

**Likelihood × cost:** See "Judgment calls for you."

---

### Authorization (and token type)

**Observation — Claim/role coupling:** Authorization decisions made by reading vendor claim shapes inline at 3 call sites. Hard-coded role strings. No domain `Principal` or policy layer.

**Evidence:**
1. `src/components/UserBadge.tsx:18` — inline `cognito:groups` read
2. `src/components/UserBadge.tsx:22` — hard-coded role string `"admin"`
3. `src/components/AdminPanel.tsx:15` — inline `cognito:groups` read **(2nd occurrence)**
4. `src/components/AdminPanel.tsx:17` — hard-coded role strings `"admin"`, `"billing-admin"`
5. `src/pages/Profile.tsx:19` — inline custom attribute `custom:tenantId` read

**Observation — Token type:** **ID token** used for API authorization (Cognito anti-pattern).

**Evidence:**
- `src/api/client.ts:15` — `session.tokens?.idToken?.toString()` attached to `Authorization` header

**Should be:** Access token for API authorization; ID token for identity only.

**Recommended seam:**
```ts
// Domain types
export interface Principal {
  userId: string;
  email: string;
  roles: string[];
  tenantId?: string;
}

// Policy layer
export function can(principal: Principal, action: Action): boolean {
  return ROLES[action].some(role => principal.roles.includes(role));
}

// Adapter maps vendor claims to domain Principal
async getPrincipal(): Promise<Principal> {
  const payload = session.tokens.idToken.payload;
  return {
    userId: payload.sub,
    email: payload.email,
    roles: payload["cognito:groups"] ?? [],
    tenantId: payload["custom:tenantId"],
  };
}

// Components ask policy, not claims
if (can(principal, "admin.view")) { /* ... */ }
```

And attach the **access token** to API calls:
```ts
const accessToken = session.tokens?.accessToken?.toString();
config.headers.Authorization = `Bearer ${accessToken}`;
```

**Likelihood × cost:** See "Judgment calls for you."

---

## Judgment calls for you

The audit deliberately did not answer the following questions, because only the maintainer can. Answering these would enable likelihood × cost scoring and a prioritized backlog.

### Token storage
- **Is a storage change actually on the table?** (e.g., a known move to HttpOnly cookies, compliance requirement, security hardening initiative)
- **How many call sites would a storage retrofit touch?** The mechanical evidence shows no custom adapter, but the true blast radius depends on how the app initializes auth, whether there are multiple entry points, and team-specific complexity.

### Refresh and owned runtime behaviors
- **Is a change to refresh or related behaviors coming?** These are often downstream of a storage move — if storage moves to HttpOnly cookies, client-side refresh breaks and must be rewritten.
- **What's the true cost to introduce owned refresh here?** The recommended pattern is ~30 lines, but integrating it depends on how tightly axios is wired into the app, whether there are multiple HTTP clients, and test coverage.

### Identity provider
- **Is a provider swap realistically possible in the next 12-24 months?** Roadmap question, not code.
- **Roughly how many call sites would it touch in practice?** The mechanical evidence shows 5 files with vendor-specific usage, but dynamic usage (e.g., `fetchUserAttributes` called conditionally) could expand this.
- **How much vendor-specific behavior are you willing to keep?** Even with a boundary, features like Cognito groups or custom attributes leak some coupling into the adapter. The question is appetite, not code.

### Authorization (and token type)
- **Is an authorization-model change planned?** (e.g., move to RBAC/ABAC, finer-grained permissions, tenant isolation, a shift from ID to access tokens)
- **What backend contracts depend on the current token choice?** If 100+ microservices expect `Authorization: Bearer <id_token>`, the retrofit cost is organizational, not just code.
- **Who owns those services, and what's the cross-team coordination cost?** Architecture is org-shaped. The right technical path can be blocked by ownership and timing.

**Without answers to these, the findings above remain observations, not a prioritized backlog.** If you can answer them, re-run the audit interactively or provide them as input, and the report will include likelihood × cost scoring and a prioritized remediation plan.

---

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** It assesses changeability (how expensive is a future change), not vulnerabilities. The finding that tokens live in `localStorage` (browser-readable, exposed to XSS exfiltration) is noted as a changeability concern under Axis 1; a real security review would assess the full threat model, XSS mitigations in place, and all other attack surfaces this audit deliberately ignores.
- **App ↔ auth boundary only.** Infrastructure, API gateways, Lambda authorizers, and IaC were out of scope.
- **Findings are evidence-backed observations.** Every finding includes `file:line` evidence. The assessment is mechanical + profile-driven; no guesswork.
