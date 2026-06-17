# Fixture: bounded-cognito

The "after" — a Cognito/Amplify v6 app with a real boundary. The auditor should come back near-clean across boundary + four axes, and the migration-readiness framing should read as "you're most of the way there."

## What each file demonstrates

### Boundary

- **`src/auth/types.ts`** — domain types (`Session`, `Principal`, `AuthError`). The vocabulary the app speaks. (B1: nothing vendor-shaped here.)
- **`src/auth/port.ts`** — `AuthPort` interface returning domain types only. (B2: presence of an `AuthPort`-style contract.)
- **`src/auth/context.tsx`** — `AuthProvider` injects an `AuthPort` instance; `useAuth()` returns a domain `Principal`. App code never imports vendors. (B2: injected, not imported.)
- **`src/auth/adapters/cognito.ts`** — the **only** file in the app that imports `aws-amplify/auth`. Implements `AuthPort`; vendor types stay inside this file.
- **`__tests__/auth-contract.test.ts`** — conformance suite written against `AuthPort`, runs against any adapter via `runAuthContractTests(makeAdapter)`. Includes a `FakeAuth` adapter to show the test surface is the port, not the vendor. (B3: contract suite present.)

### Four axes

- **`src/auth/adapters/cognito.ts`** — sets `cognitoUserPoolsTokenProvider.setKeyValueStorage(new MemoryKeyValueStorage())`. (Axis 1: custom storage adapter via the vendor's storage seam, not the default.)
- **`src/auth/refresh.ts`** — single-flight `refreshOnce()` helper. (Axis 2: owned refresh, single-flight.)
- **`src/api/client.ts`** — `createApiClient(auth: AuthPort)` factory. 401 → `auth.onRefresh()` → retry once → `auth.onSessionExpired()` on failure. (B2 + Axis 2: injected port; owned 401/refresh path; explicit failure.)
- **`src/auth/adapters/cognito.ts`** — `getAuthHeaders()` attaches the **access token** (`session.tokens?.accessToken?.toString()`), not the ID token. (Axis 4: token-type bounded.)
- **`src/auth/adapters/cognito.ts`** — `getPrincipal()` reads `cognito:groups` and `custom:*` claims **only here**, mapping them to a domain `Principal` (roles + tenantId). Claim names never appear elsewhere. (Axis 3 + Axis 4: vendor-specific surface localized to the adapter; no inline claim reads in app code.)
- **`src/auth/policy.ts`** — `can(principal, action)` is the only place authorization decisions are made. Components ask the policy, not the claim. (Axis 4: claim/role coupling resolved into a domain policy.)

### App-layer usage (proves the boundary is actually used, not just defined)

- **`src/components/UserBadge.tsx`** — uses `useAuth()` to read the domain `Principal`. No vendor imports anywhere in the component.
- **`src/components/AdminPanel.tsx`** — asks `policy.can(principal, "admin.view")` instead of reading `cognito:groups`. No hard-coded role strings.
- **`src/pages/Profile.tsx`** — reads `principal.email` and `principal.tenantId` from the domain shape. No `fetchUserAttributes` or `custom:*` access.

## Expected auditor output (shape)

**Boundary:** present on all four signals. Single adapter; vendor types confined to it; `AuthPort` exists and is injected; contract suite present; client/server split absorbed (single port).

**Axes:**

- **Storage** — custom adapter via `setKeyValueStorage` at `src/auth/adapters/cognito.ts:N`. Swappable.
- **Refresh / owned behaviors** — owned 401 path with single-flight at `src/api/client.ts` and `src/auth/refresh.ts`. Explicit `onSessionExpired`.
- **Identity provider** — provider-specific surface (`cognito:groups`, `custom:*`, `setKeyValueStorage`) **localized to one adapter file**.
- **Authorization / token type** — access token attached to API calls; domain `Principal` produced by the adapter; policy decisions in `src/auth/policy.ts`; no inline claim reads.

If the maintainer flags a likely change (e.g. provider swap), migration-readiness should read high: "you're ~80%+ there; remaining work is one new adapter passing the contract suite."

No prioritization without an interview — but the report should land near-empty with a migration-readiness framing rather than a list of risks.
