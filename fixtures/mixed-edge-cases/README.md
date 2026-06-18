# Fixture: mixed-edge-cases

A stress-test fixture. Simulates a codebase **mid-migration from Auth0 to Cognito**, with **Firebase analytics** alongside. Tests four edge cases the simpler fixtures don't:

1. **Multi-vendor detection** — both `aws-amplify` and `@auth0/auth0-spa-js` are in `package.json` and imported in code. The skill should load BOTH profiles and assess each independently.
2. **Unknown vendor honesty** — `firebase` is in `package.json` and imported, but there's no `vendors/firebase.md` profile. The skill should declare this as a **coverage gap**, not silently ignore it or guess.
3. **Look-alike storage trap** — `src/auth/adapters/cognito.ts:24` calls `setKeyValueStorage(sessionStorage)`, where `sessionStorage` is imported from `aws-amplify/utils`. The profile explicitly warns this is a **built-in selector, NOT a custom adapter**. A naive auditor seeing `setKeyValueStorage(...)` would credit this as "owned storage" — that's the failure mode.
4. **Partial boundary** — the Cognito side has a new boundary (AuthPort + adapter + domain types). The Auth0 side is calcified (leaky facade, direct vendor imports, inline namespaced-claim reads, hard-coded roles). The skill must distinguish between them, not generalize.

## What each file demonstrates

### Cognito side (new, mostly bounded)

- **`src/auth/port.ts`** — `AuthPort` interface (B2 signal: contract exists)
- **`src/auth/types.ts`** — domain `Principal` + `AuthError` (B1 signal: domain vocabulary)
- **`src/auth/adapters/cognito.ts`** — Cognito adapter implementing `AuthPort`. Vendor types confined, claim mapping localized, access token used, refresh present. **BUT** uses `sessionStorage` (built-in selector) — Axis 1 trips look-alike trap.
- **`src/api/client.ts`** — uses the boundary via injection (clean)
- **`src/components/NewProfile.tsx`** — uses domain `Principal` only (clean)

### Auth0 side (legacy, calcified)

- **`src/legacy/auth0-helpers.ts`** — leaky facade: returns Auth0's `User` and `Auth0Client` types directly. Bare `getTokenSilently()` without `audience` (the Auth0 anti-pattern — opaque token, not a JWT).
- **`src/components/LegacyAdmin.tsx`** — direct `@auth0/auth0-spa-js` import, vendor `User` type in state, inline namespaced-claim reads (`user["https://legacy.example.com/roles"]`), hard-coded role strings (`"admin"`, `"super-admin"`).

### Unknown vendor (Firebase)

- **`src/lib/firebase-analytics.ts`** — Firebase analytics usage. No `vendors/firebase.md` profile exists, so the skill cannot safely assess this. Should be declared as a **coverage gap** in the audit output.

## Expected auditor behavior

### Coverage section must contain
- "**Vendor profiles used:** `vendors/amplify-cognito.md`, `vendors/auth0.md`."
- "**Vendor detected but no profile available:** `firebase` (`src/lib/firebase-analytics.ts`). Not assessed."

If the skill silently drops Firebase, that's a **false all-clear** — exactly what non-negotiable #2 forbids.

### Boundary assessment must be split
- **Cognito side:** PRESENT (with caveat on storage — see Axis 1)
- **Auth0 side:** ABSENT (leaky facade, direct imports, inline claim reads, vendor types in app)

A single overall verdict ("the system is bounded" or "the system is calcified") would be wrong. The skill must report mid-migration state honestly.

### Axis 1 (storage) must catch the look-alike trap

A correct finding:
> Cognito storage: uses `sessionStorage` from `aws-amplify/utils` passed to `setKeyValueStorage` at `src/auth/adapters/cognito.ts:24`. This is the vendor's **built-in selector**, NOT a custom storage adapter. To be swappable, replace with a class implementing `KeyValueStorageInterface`.

An **incorrect** finding (what would happen if the skill grepped without confirming):
> ❌ Cognito storage: custom storage adapter present (`setKeyValueStorage` called at `src/auth/adapters/cognito.ts:24`). Swappable.

This is the test of the locate→confirm discipline. The locate step finds `setKeyValueStorage(...)`. The confirm step must read what's PASSED to determine if it's a custom class or a built-in selector.

### Axis 3 (provider) findings must be per-vendor
- Cognito-specific surface: **localized** to one adapter file
- Auth0-specific surface: **scattered** across legacy files

### Auth0-specific anti-pattern (from the profile)
`src/legacy/auth0-helpers.ts:25` — `getTokenSilently()` called with no `audience` anywhere → opaque token, not JWT. The Auth0 profile says this is "the documented anti-pattern" and to flag it explicitly.

## What this fixture proves when the skill runs on it

If the audit comes back with:
1. ✅ Both Cognito and Auth0 profiles loaded
2. ✅ Firebase declared as a coverage gap (not silently dropped)
3. ✅ Look-alike trap correctly identified ("built-in selector, not custom adapter")
4. ✅ Boundary assessment split per vendor, not collapsed to one verdict
5. ✅ Auth0 opaque-token anti-pattern flagged

…then the skill handles real-world complexity honestly. If it fails on any of these — especially #2 or #3 — it's pretending to know things it doesn't.
