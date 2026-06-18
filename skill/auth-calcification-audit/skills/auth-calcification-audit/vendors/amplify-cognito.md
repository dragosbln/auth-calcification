# Amazon Cognito (AWS Amplify v6)

The base profile. Targets Amplify v6's modular `aws-amplify/auth` API. Amplify v5 (`Auth.currentSession()` etc.) is noted under traps.

## Identification
- **Packages**: `aws-amplify`, `@aws-amplify/auth`, `@aws-amplify/core`, `@aws-amplify/adapter-nextjs` (SSR), `amazon-cognito-identity-js` (lower-level, sometimes used directly).
- **Import specifiers**: `aws-amplify/auth`, `aws-amplify/auth/cognito`, `aws-amplify/utils`, `@aws-amplify/adapter-nextjs`. (Amplify v5 imported from `aws-amplify` as `Auth`.)

## Vendor types (leak candidates)
`AuthSession` (returned by `fetchAuthSession`), `AuthTokens`, `JWT`, `AuthUser` (returned by `getCurrentUser`), `FetchUserAttributesOutput`, `AuthError`. The most common leak is an app-layer function returning an `AuthSession` or its `.tokens`, or a domain function typed to return Amplify's `AuthUser`.

## Token storage seam
- **Default storage**: browser `localStorage` (keys prefixed `CognitoIdentityServiceProvider.*`); in-memory if `localStorage` is unavailable.
- **Custom storage API**: `cognitoUserPoolsTokenProvider.setKeyValueStorage(storage)` — `cognitoUserPoolsTokenProvider` from `aws-amplify/auth/cognito`. `storage` implements `KeyValueStorageInterface` (`setItem`, `getItem`, `removeItem`, `clear`) — interface from `aws-amplify/utils`. A user-defined class implementing the interface = owned storage. For Next.js, the SSR cookie path is wired via `createServerRunner` from `@aws-amplify/adapter-nextjs` plus `Amplify.configure(config, { ssr: true })` on the client; server-side Amplify APIs import from `aws-amplify/auth/server` and run inside `runWithAmplifyServerContext`.
- **Even deeper customization**: a full `tokenProvider` (and `credentialsProvider`) can be passed to `Amplify.configure(awsconfig, { Auth: { tokenProvider: ... } })`. Presence of a custom `tokenProvider` is a strong "owned" signal beyond just storage.
- **Look-alikes that are NOT custom storage**: passing the *built-in* `defaultStorage`, `sessionStorage`, or `new CookieStorage()` (all from `aws-amplify/utils`) to `setKeyValueStorage` configures persistence but is a built-in selector, not a custom adapter — note the distinction in the finding. The main risk is the opposite: missing `setKeyValueStorage` entirely (= default localStorage).
- **Important caveat**: `setKeyValueStorage` overrides storage for the **TokenStore only**. The `identityId` (Cognito Identity Pool) is held in a separate `IdentityIdStore` that still uses `localStorage` in v6. "Owned storage" via `setKeyValueStorage` is a real signal but is not a complete storage swap if Identity Pools are in use. Note this in the finding.

## Refresh and owned-behavior entry points
- **Refresh**: `fetchAuthSession()` refreshes silently and automatically when tokens are near expiry (this is the inherited magic); `fetchAuthSession({ forceRefresh: true })` forces it. A bare `fetchAuthSession()` sprinkled across app code with no 401-interceptor/single-flight ownership is the inherited-refresh signal. The silent refresh depends on tokens being readable by JS — it breaks on a move to HttpOnly cookies.
- **Other owned behaviors**: sign-out via `signOut({ global: true })` for cross-device; Amplify Hub (`Hub.listen('auth', …)`) for auth lifecycle events / multi-tab reaction. Absence of explicit handling = inherited.

## Claim and role surface
- **Claim access shapes**: reading `session.tokens.idToken.payload['cognito:groups']`, `payload['cognito:username']`, `payload['custom:<attr>']`, or any direct `idToken.payload[...]` access in app code. Cognito groups are namespaced as `cognito:groups`.
- **Role / permission location**: Cognito **user pool groups** (in the `cognito:groups` claim) and/or **custom attributes** (`custom:role` etc.). No built-in fine-grained permissions model.

## Provider-specific feature surface
Cognito user pool **groups**; **custom attributes** (`custom:*`); admin/management APIs via `@aws-sdk/client-cognito-identity-provider` (`AdminAddUserToGroup`, `AdminGetUser`, `ListUsers`, etc. — usually backend, flag if in app code); `fetchUserAttributes` / `updateUserAttributes`; multi-pool / identity-pool (federated) constructs.

## Token type
- **ID vs access token**: `fetchAuthSession()` returns both `tokens.idToken` and `tokens.accessToken`. Cognito apps very commonly send the **ID token** in `Authorization` (historical default); the hardening move is to send the **access token**. Detect which one is read and attached to outbound requests.

## Sign-in / sign-out surface
`signIn`, `signOut`, `signUp`, `confirmSignIn`, `confirmSignUp`, `resetPassword` from `aws-amplify/auth`; `signInWithRedirect` for hosted UI / Managed Login.

## Vendor notes and traps
- **v5 vs v6**: v5 used a singleton `Auth` object (`Auth.currentSession()`, `Auth.currentAuthenticatedUser()`, `Auth.configure(...)`). v6 is modular functions imported from `aws-amplify/auth`. A codebase may be mid-migration; recognize both, and note the version in findings.
- **SSR import sub-paths**: server-side calls use `aws-amplify/auth/server` (e.g. `import { fetchAuthSession } from 'aws-amplify/auth/server'`), and run inside `runWithAmplifyServerContext`. A bare `aws-amplify/auth` import in a Server Component is a likely bug, not a finding for this skill, but worth a note.
- **`setKeyValueStorage` ≠ full storage swap**: it only overrides the TokenStore. If the app uses Cognito **Identity Pools**, `identityId` remains in `localStorage`. Report owned storage accurately rather than overstating it.
- Don't treat presence of `@aws-amplify/adapter-nextjs` alone as "owned storage" — confirm `createServerRunner` is actually invoked and `Amplify.configure(..., { ssr: true })` is set.

## Verification
- **Last verified against**: `aws-amplify` v6 / Amplify Gen 2 docs as of 2026-06-17 — confirmed `setKeyValueStorage` + `KeyValueStorageInterface` (from `aws-amplify/utils`), `fetchAuthSession({ forceRefresh: true })`, `createServerRunner` from `@aws-amplify/adapter-nextjs` with `runtimeOptions.cookies`, server APIs at `aws-amplify/auth/server`, and custom `tokenProvider` via `Amplify.configure`. Re-verify against current docs if the SDK has moved on materially.
