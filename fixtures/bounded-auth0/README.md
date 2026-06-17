# Fixture: bounded-auth0

The portability proof. **The same app code as `bounded-cognito` with an Auth0 adapter swapped in.** Every file outside `src/auth/adapters/` is byte-identical to its `bounded-cognito` counterpart — `port.ts`, `types.ts`, `refresh.ts`, `policy.ts`, `context.tsx`, the api client, the components, the page. If the boundary is real, that's what should be true.

The auditor should come back near-clean with high migration-readiness, structurally similar to `bounded-cognito`'s output. That structural similarity is the demonstration: **the methodology travels**.

## What each file demonstrates

### Boundary

- **`src/auth/types.ts`** — same domain types as `bounded-cognito` (`Session`, `Principal`, `AuthError`). The app speaks the same vocabulary regardless of provider.
- **`src/auth/port.ts`** — same `AuthPort` interface. (B2: presence of an `AuthPort`-style contract.)
- **`src/auth/context.tsx`** — same `AuthProvider` injecting an `AuthPort`. (B2: injected, not imported.)
- **`src/auth/adapters/auth0.ts`** — the **only** file in the app that imports `@auth0/auth0-spa-js`. Vendor types (`Auth0Client`, `ICache`), namespaced-claim URLs, and Auth0-specific knobs (`audience`, `scope`) stay inside this file.
- **`__tests__/auth-contract.test.ts`** — the **same `runAuthContractTests`** as `bounded-cognito`, run against `FakeAuth` and against the Auth0 adapter (with the SDK mocked at the import boundary). The contract assertions are identical: domain-only, no vendor shape. (B3: the contract suite is what makes "migration = make the new adapter green" mechanically true.)

### Four axes

- **`src/auth/adapters/auth0.ts`** — passes a custom `ICache` to `createAuth0Client({ cache: new MemoryCache() })`. (Axis 1: the *real* storage seam in Auth0, not `cacheLocation` — that's a built-in selector, easy to conflate.)
- **`src/auth/refresh.ts`** — same single-flight `refreshOnce()` helper. (Axis 2: owned refresh, single-flight.)
- **`src/api/client.ts`** — same `createApiClient(auth: AuthPort)` factory. 401 → `auth.onRefresh()` → retry once → `auth.onSessionExpired()` on failure. The adapter's `onRefresh` calls `getAccessTokenSilently({ cacheMode: "off", ... })` under the single-flight lock. (B2 + Axis 2: same shape as `bounded-cognito`.)
- **`src/auth/adapters/auth0.ts`** — `getAuthHeaders()` attaches the **access token** from `getAccessTokenSilently({ authorizationParams: { audience, scope } })`. `audience` is what makes it a real JWT API access token rather than the opaque-token Auth0 anti-pattern. (Axis 4: token-type bounded; the Auth0-specific misuse trap deliberately avoided.)
- **`src/auth/adapters/auth0.ts`** — `getPrincipal()` reads namespaced custom claims (`user['${namespace}roles']`, `user['${namespace}tenantId']`) **only here**, mapping them to the same domain `Principal` (`roles`, `tenantId`) as `bounded-cognito`. The namespaced URL keys never appear in app code. (Axis 3 + Axis 4: vendor-specific surface localized to the adapter.)
- **`src/auth/policy.ts`** — identical to `bounded-cognito`. The policy doesn't know — and shouldn't know — which provider produced the `Principal`.

### App-layer usage

`UserBadge.tsx`, `AdminPanel.tsx`, `ProfilePage.tsx`: **byte-identical** to `bounded-cognito`. The fact that none of these files needed to change to swap providers is the strongest possible demonstration that the boundary is real.

## Expected auditor output (shape)

Structurally the same near-clean output as `bounded-cognito`:

**Boundary:** present on all four signals. Single adapter; vendor types confined to it; `AuthPort` exists and is injected; contract suite present (the same suite).

**Axes:**

- **Storage** — custom `ICache` adapter at `src/auth/adapters/auth0.ts:N`. Swappable. (Auditor should NOT mistake `cacheLocation` for custom storage — the Auth0 profile's look-alike note is the safety check.)
- **Refresh / owned behaviors** — owned 401 path with single-flight at `src/api/client.ts` and `src/auth/refresh.ts`. Explicit `onSessionExpired`. (Auditor should note the Auth0 refresh model — `getAccessTokenSilently` + refresh tokens — differs from Cognito's auto-refresh; this is documented in the Auth0 profile.)
- **Identity provider** — Auth0-specific surface (`audience`, `scope`, namespaced claim URLs, `ICache`) **localized to one adapter file**.
- **Authorization / token type** — access token attached to API calls; `audience` configured (so the token is a real JWT, not opaque); domain `Principal` produced by the adapter; policy decisions in `src/auth/policy.ts`.

If the methodology is sound, the report's **shape** should look like `bounded-cognito`'s report — same sections, same near-empty findings, same high migration-readiness — even though the underlying provider is different. That's the portability proof.
