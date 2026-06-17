# Auth0

Second profile, included to force and prove vendor portability. Targets the SPA/React and Next.js SDKs.

## Identification
- **Packages**: `@auth0/auth0-react` (React), `@auth0/auth0-spa-js` (core SPA), `@auth0/nextjs-auth0` (Next.js), `express-openid-connect` (Express). `auth0` (Node) and `auth0-js` (legacy) signal Management-API / legacy usage.
- **Import specifiers**: `@auth0/auth0-react`, `@auth0/auth0-spa-js`, `@auth0/nextjs-auth0`, `@auth0/nextjs-auth0/client`.

## Vendor types (leak candidates)
`User` (Auth0's user shape, from `useUser` / `useAuth0`), `Auth0ContextInterface`, `IdToken`, `GetTokenSilentlyOptions`, `AppState`, `Auth0Client`. The common leak is app code consuming Auth0's `User` directly as its session/principal type, or threading `Auth0Client` through app layers.

## Token storage seam
- **Default storage**: in-memory token cache by default; refresh handled via hidden-iframe silent auth unless refresh tokens are enabled (`useRefreshTokens: true`).
- **Custom storage API**: pass a `cache` implementing the **`ICache`** interface (`get<T>(key)`, `set<T>(key, entry)`, `remove(key)`, optional `allKeys()`) to `Auth0Provider` / `createAuth0Client`. A custom `ICache` = owned storage. `ICache`, `InMemoryCache`, and `LocalStorageCache` are all exported from `@auth0/auth0-spa-js`.
- **Look-alikes that are NOT custom storage**: `cacheLocation: 'memory' | 'localstorage'` is a **built-in selector**, not a custom adapter (the Auth0 analog of the Firebase trap). `useRefreshTokens: true` changes the refresh *mechanism*, not storage. Don't report either as a custom storage adapter. Note: if both `cache` and `cacheLocation` are set, `cache` takes precedence and the SDK warns in the console.

## Refresh and owned-behavior entry points
- **Refresh**: `getAccessTokenSilently()` obtains/refreshes the access token (via refresh token or silent iframe); `checkSession()` re-checks the session. Auth0's model is more explicit than Amplify's auto-refresh, but bare `getAccessTokenSilently()` calls scattered across app code with no single-flight/interceptor ownership is still the inherited-behavior signal — note the difference honestly rather than forcing the Cognito framing.
- **Other owned behaviors**: logout via `logout({ logoutParams: { ... } })`; multi-tab sync is not automatic — its absence is expected, so flag only if the app clearly needs it.

## Claim and role surface
- **Claim access shapes**: reading namespaced custom claims off the user/ID token, e.g. `user['https://<your-namespace>/roles']`, `user['https://<your-namespace>/permissions']`. Any inline `user['https://...']` access in app code is the coupling signal.
- **Role / permission location**: roles/permissions delivered as **namespaced custom claims** (added via an Auth0 Action), in `app_metadata`/`user_metadata`, or as `permissions` in the access token when **RBAC** is enabled on the API.

## Provider-specific feature surface
**Organizations** (B2B multi-tenant); **roles & permissions / RBAC**; **Actions** (server-side, won't appear in app code); **Management API** via the `auth0` Node SDK or raw calls (`getUsers`, `assignRolestoUser`, etc. — flag if in app code); `app_metadata` / `user_metadata` reads.

## Token type
- **ID vs access token**: the **access token** is for calling APIs and is obtained via `getAccessTokenSilently({ authorizationParams: { audience, scope } })` (auth0-spa-js v2 / auth0-react v2+; v1 placed `audience` at the top level — recognize both); the **ID token** is for identity. Auth0 strongly separates these by design, so ID-token-for-API is less common here than with Cognito — but still detect which token is attached to outbound requests.
- **Strong misuse signal**: a missing `audience` means `getAccessTokenSilently` returns an **opaque (non-JWT) token** that is not a valid API access token. If you see API calls authorized by `getAccessTokenSilently()` with no `audience` configured anywhere — or by `getIdTokenClaims().__raw` / the ID token directly — flag it: the app is likely leaning on the ID token for API auth (the exact anti-pattern Auth0 documents against).

## Sign-in / sign-out surface
`loginWithRedirect`, `loginWithPopup`, `logout`, `getAccessTokenSilently`, `isAuthenticated`, `useAuth0` (React); `handleAuth`, `getSession`, `withApiAuthRequired` (`@auth0/nextjs-auth0`).

## Vendor notes and traps
- **Namespaced claims are mandatory**: Auth0 silently drops non-namespaced custom claims, so roles/permissions appear under a full URL key. Don't expect a bare `roles` claim.
- **Distinguish `cacheLocation` (built-in) from a custom `ICache` (real adapter)** — easy to conflate. If both are present, `cache` wins (the SDK warns).
- **v1 → v2 shape change**: auth0-spa-js v2 / auth0-react v2 nest `audience`, `scope`, `redirect_uri` etc. under `authorizationParams`; v1 had them at the top level. Recognize both forms in `Auth0Provider` props and in `getAccessTokenSilently`/`loginWithRedirect` calls.
- `audience` is what makes Auth0 issue a real JWT API access token; its absence yields an opaque token and very often indicates the app is leaning on the ID token instead.

## Verification
- **Last verified against**: `@auth0/auth0-spa-js` v2 and `@auth0/auth0-react` v2 API docs (auth0.github.io) as of 2026-06-17 — confirmed `ICache` interface (`get`/`set`/`remove`/optional `allKeys`, all `MaybePromise`), `cache`-over-`cacheLocation` precedence, `getAccessTokenSilently({ authorizationParams: { audience, scope } })`, opaque-token behavior without `audience`, and namespaced-claim requirement. Re-verify against current docs if the SDK has moved on materially.
