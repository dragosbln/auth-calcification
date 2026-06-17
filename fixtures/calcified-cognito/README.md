# Fixture: calcified-cognito

A deliberately-calcified Cognito/Amplify v6 app. The auditor should flag findings across the boundary + all four axes; nothing here is meant to be a clean example.

## What each file demonstrates

- **`src/lib/amplify-config.ts`** — Amplify configured with no `setKeyValueStorage` call → default `localStorage`. (Axis 1: inherited storage.)
- **`src/components/UserBadge.tsx`** — directly imports `aws-amplify/auth`, returns the vendor's `AuthSession`, reads `idToken.payload['cognito:groups']` inline, hard-coded role string `"admin"`. (Boundary B1 + B2; Axis 3 vendor-specific surface; Axis 4 inline claim read + hard-coded role.)
- **`src/api/client.ts`** — `axios` interceptor calling bare `fetchAuthSession()` and attaching `tokens.idToken.toString()` as the `Authorization` header. (Boundary B2: vendor imported, not injected; Axis 2: inherited refresh, no single-flight, no failure path; Axis 4: ID token used for API auth.)
- **`src/components/AdminPanel.tsx`** — another inline claim/role read in a different file, to show the spread. (Axis 4: scattered coupling.)
- **`src/pages/Profile.tsx`** — direct call to `fetchUserAttributes` (vendor-specific surface) from page-level code. (Axis 3.)
- **`src/lib/auth-helpers.ts`** — a "wrapper" that re-exports vendor functions but returns the vendor's `AuthSession` directly: a **leaky facade** (the worst trap — looks bounded, isn't).
- **`__tests__/auth.test.ts`** — mocks `aws-amplify/auth` and asserts on its shape. (Boundary B3: no contract suite.)

## Expected auditor output (shape, not exact wording)

**Boundary:** absent across all four signals — no `AuthPort`, vendor types leak, direct imports everywhere, no contract suite. The "wrapper" in `lib/auth-helpers.ts` is a leaky facade and should be called out as one.

**Axes:**
- **Storage** — default localStorage; no `setKeyValueStorage` call.
- **Refresh / owned behaviors** — bare `fetchAuthSession()` in the api interceptor; no single-flight, no `onSessionExpired`.
- **Identity provider** — Cognito groups, `cognito:*` claims, and `fetchUserAttributes` scattered across components and pages.
- **Authorization / token type** — inline `idToken.payload['cognito:groups']` reads in two components; hard-coded role strings; **ID token** attached to outbound API requests.

No prioritization without an interview. Coverage section should list this app's paths.
