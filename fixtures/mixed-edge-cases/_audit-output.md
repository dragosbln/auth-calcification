# Authentication Calcification Audit — `fixtures/mixed-edge-cases`

## Summary

**This codebase is mid-migration.** A new Cognito boundary is being built (`src/auth/`), while legacy Auth0 code remains direct and calcified (`src/legacy/`, `src/components/LegacyAdmin.tsx`). **Three vendors detected:** AWS Amplify (Cognito) and Auth0 are both used for authentication and have profiles; **Firebase is used (for analytics, based on the imports) but no profile exists in `vendors/`, so that surface was not assessed.** The Cognito side is bounded structurally, with one important caveat: the storage configuration uses a built-in selector (`sessionStorage`), not a custom adapter — Axis 1 is **not** actually swappable. The Auth0 side has no boundary and shows scattered vendor-specific coupling.

## Coverage

**Vendor profiles used:**
- `vendors/amplify-cognito.md` (verified against `aws-amplify` v6 as of 2026-06-17) — used to assess Cognito surface
- `vendors/auth0.md` (verified against `@auth0/auth0-spa-js` v2 as of 2026-06-17) — used to assess Auth0 surface

**Vendor detected but no profile available — NOT ASSESSED:**
- **`firebase`** at `src/lib/firebase-analytics.ts:1-2` (`firebase/app`, `firebase/analytics` imports; `firebase` in `package.json`). No `vendors/firebase.md` profile exists. The skill cannot safely assess Firebase calcification without one. **This is a coverage gap.** Based on the imports used (`getAnalytics`, `logEvent`), Firebase appears to be used for analytics, not authentication — but the skill does not assume this; a real audit would require either a Firebase profile or a maintainer's confirmation that Firebase is not on the auth path.

**Analyzed:**
- 8 TypeScript/TSX files: `src/api/client.ts`, `src/auth/adapters/cognito.ts`, `src/auth/port.ts`, `src/auth/types.ts`, `src/components/LegacyAdmin.tsx`, `src/components/NewProfile.tsx`, `src/legacy/auth0-helpers.ts`, `src/lib/firebase-analytics.ts` (read for imports; not assessed for calcification)
- `package.json` for vendor identification

**Not analyzed:**
- None beyond the Firebase gap noted above.

## Boundary assessment

The boundary is **split** between vendors — there is no single overall verdict. The codebase is mid-migration, and that has to be reported honestly.

### Cognito side — boundary PRESENT (with caveat on storage; see Axis 1)

- **Anti-corruption layer (PRESENT):** Domain types defined at `src/auth/types.ts`. Cognito's `AuthSession`, `AuthTokens`, etc. confined to `src/auth/adapters/cognito.ts`. No vendor type leak found in `src/auth/`, `src/api/`, `src/components/NewProfile.tsx`.
- **Injected vs imported (PRESENT):** `AuthPort` interface at `src/auth/port.ts:6-12`. `createApiClient(auth: AuthPort)` at `src/api/client.ts:5`. `NewProfile.tsx` constructs the adapter (line 11) but works with the domain `Principal` — vendor types don't cross the call site.
- **Contract-tested (ABSENT):** No contract suite present for the Cognito adapter. `runAuthContractTests`-style suite not found. This is a gap on the new side — the boundary exists structurally but isn't enforced by tests.
- **Client/server split absorbed (N/A):** No SSR code present.

### Auth0 side — boundary ABSENT

- **Anti-corruption layer (ABSENT):** Auth0's `User` type leaks into application code in 2 locations:
  - `src/legacy/auth0-helpers.ts:17` — `getLegacyUser(): Promise<User | undefined>` returns vendor type
  - `src/components/LegacyAdmin.tsx:9` — `useState<User | undefined>` typed with vendor type
  - `src/legacy/auth0-helpers.ts:7` — `getAuth0Client(): Promise<Auth0Client>` exports vendor client type
- **Injected vs imported (ABSENT):** Auth0 SDK imported directly in app code at:
  - `src/legacy/auth0-helpers.ts:5` — `import { createAuth0Client, type User, type Auth0Client } from "@auth0/auth0-spa-js"`
  - `src/components/LegacyAdmin.tsx:5` — `import { type User } from "@auth0/auth0-spa-js"`
  
  No `AuthPort`-shaped abstraction over Auth0; `LegacyAdmin` constructs the client directly via `getAuth0Client()`.
- **Contract-tested (ABSENT):** No contract suite for the Auth0 surface.

**This split matters.** A single overall verdict ("the system is bounded" OR "the system is calcified") would mislead. The reality is that this codebase is in transition: the new direction is solid, the old surface is still calcified, and the migration is not complete.

---

## Findings by axis

Findings are reported per vendor where the surface differs.

### Token storage

#### Cognito side — **Built-in selector, NOT a custom adapter**

**Observation:** Storage configuration uses Amplify's built-in `sessionStorage` selector, not a user-defined `KeyValueStorageInterface` implementation. **The storage is not actually swappable.**

**Evidence:**
- `src/auth/adapters/cognito.ts:14` — `import { sessionStorage } from "aws-amplify/utils"` (built-in selector)
- `src/auth/adapters/cognito.ts:24` — `cognitoUserPoolsTokenProvider.setKeyValueStorage(sessionStorage)` — built-in selector passed to the storage seam

**The locate→confirm distinction:** A grep for `setKeyValueStorage(` would find this call. The confirm step — reading what is passed — reveals that `sessionStorage` is the built-in selector from `aws-amplify/utils`, not a class implementing `KeyValueStorageInterface`. Per the Cognito profile: "passing the *built-in* `defaultStorage`, `sessionStorage`, or `new CookieStorage()` (all from `aws-amplify/utils`) to `setKeyValueStorage` configures persistence but is a built-in selector, not a custom adapter."

**Recommended seam:** To make storage genuinely swappable, replace with a user-defined class:

```ts
import type { KeyValueStorageInterface } from "aws-amplify/utils";

class CustomStorage implements KeyValueStorageInterface {
  async setItem(key: string, value: string) { /* ... */ }
  async getItem(key: string) { /* ... */ }
  async removeItem(key: string) { /* ... */ }
  async clear() { /* ... */ }
}

cognitoUserPoolsTokenProvider.setKeyValueStorage(new CustomStorage());
```

**Important caveat from the profile:** Even with a custom adapter, `setKeyValueStorage` overrides storage for the **TokenStore only**. If Cognito Identity Pools are in use, `identityId` remains in `localStorage`. Not visible in this fixture but worth checking in a real audit.

**Likelihood × cost:** See "Judgment calls for you."

#### Auth0 side — **No storage configured**

**Observation:** No `cache: ...` option passed to `createAuth0Client`. No `cacheLocation` either. Auth0 defaults to in-memory token cache.

**Evidence:**
- `src/legacy/auth0-helpers.ts:10-15` — `createAuth0Client` called with only `domain` and `clientId`; no `cache`, no `cacheLocation`, no `useRefreshTokens`

**Recommended seam:** Pass a custom `ICache` implementation if storage swappability matters.

**Likelihood × cost:** See "Judgment calls for you."

---

### Refresh and owned runtime behaviors

#### Cognito side — **Partially owned**

**Observation:** `onRefresh()` is implemented in the adapter (`src/auth/adapters/cognito.ts:46-53`), with `fetchAuthSession({ forceRefresh: true })` inside. The API client's 401 path (`src/api/client.ts:16-22`) calls `auth.onRefresh()` with retry and explicit failure. **However, no single-flight deduplication is present** — N concurrent 401s would trigger N refresh calls. The bounded shape from `bounded-cognito` uses a `refreshOnce()` helper; this fixture lacks it.

**Evidence:**
- `src/auth/adapters/cognito.ts:46-53` — `onRefresh()` exists but is not wrapped in a single-flight helper
- `src/api/client.ts:16-22` — 401 → `auth.onRefresh()` → retry → `auth.onSessionExpired()` path is in place

**Recommended seam:** Add a single-flight wrapper. See `bounded-cognito/src/auth/refresh.ts` for the pattern.

#### Auth0 side — **Inherited**

**Observation:** Bare `getTokenSilently()` call with no 401 interceptor, no single-flight, no failure path. Refresh is whatever Auth0 does by default.

**Evidence:**
- `src/legacy/auth0-helpers.ts:25` — `c.getTokenSilently()` called directly with no surrounding ownership
- No 401 handling found in any Auth0-side code path

**Likelihood × cost:** See "Judgment calls for you."

---

### Identity provider

#### Cognito side — **Localized**

**Observation:** Cognito-specific surface confined to the adapter.

**Evidence:**
- `src/auth/adapters/cognito.ts:35-41` — `cognito:groups`, `custom:tenantId`, `cognito` claim names read **only here**
- `src/auth/adapters/cognito.ts:9-14` — `aws-amplify` imports confined to this file
- No Cognito surface found in `src/components/NewProfile.tsx`, `src/api/client.ts`

**Recommended seam:** None required for Cognito; the surface is localized.

#### Auth0 side — **Scattered**

**Observation:** Auth0-specific surface used directly in app code in 2 files. No localization.

**Evidence:**
- `src/legacy/auth0-helpers.ts:5,17,25` — `@auth0/auth0-spa-js` imports, `User` type return, direct `getTokenSilently()` call
- `src/components/LegacyAdmin.tsx:5,9,18` — direct vendor import, `User` type in component state, namespaced-claim URL read inline (`user["https://legacy.example.com/roles"]`)

**Recommended seam:** Bring the Auth0 surface behind the same `AuthPort` as Cognito (write a second adapter). Migration would touch 2 files.

**Likelihood × cost:** See "Judgment calls for you."

---

### Authorization (and token type)

#### Cognito side — **Bounded**

**Observation — Claim/role coupling:** Claim mapping localized to adapter at `src/auth/adapters/cognito.ts:38-40`. App-layer code (`NewProfile.tsx`) reads domain `Principal` only. **However, no domain policy layer is present** — `NewProfile` doesn't do authorization checks, so this isn't yet tested in real usage. (The `bounded-cognito` fixture has a `policy.ts`; this one doesn't.)

**Observation — Token type:** **Access token** used for API authorization at `src/auth/adapters/cognito.ts:29`.

#### Auth0 side — **Calcified, with Auth0-specific anti-pattern**

**Observation — Claim/role coupling:** Inline namespaced-claim reads + hard-coded role strings in `LegacyAdmin.tsx`.

**Evidence:**
- `src/components/LegacyAdmin.tsx:18` — `user["https://legacy.example.com/roles"]` — inline namespaced-claim URL read
- `src/components/LegacyAdmin.tsx:20` — hard-coded role strings `"admin"`, `"super-admin"`
- No domain `Principal` or policy layer applied to the Auth0 side

**Observation — Token type (Auth0 ANTI-PATTERN):** `getTokenSilently()` called with **no `audience` configured anywhere**. Per the Auth0 profile: "a missing `audience` means `getAccessTokenSilently` returns an **opaque (non-JWT) token** that is not a valid API access token... the app is likely leaning on the ID token for API auth (the exact anti-pattern Auth0 documents against)."

**Evidence:**
- `src/legacy/auth0-helpers.ts:10-15` — `createAuth0Client` config has no `authorizationParams.audience`
- `src/legacy/auth0-helpers.ts:25` — `c.getTokenSilently()` called with no `audience` option

**This is a documented Auth0 anti-pattern.** Whatever this token is being used for, it's not a real API access token. If the backend validates these as JWTs, validation will fail; if it accepts them anyway, the auth model is broken.

**Recommended seam:** Configure `audience` in the SDK initialization and pass `authorizationParams: { audience }` to token calls. See `bounded-auth0/src/auth/adapters/auth0.ts` for the pattern.

**Likelihood × cost:** See "Judgment calls for you."

---

## Judgment calls for you

The audit deliberately did not answer the following questions. Answering them would enable likelihood × cost scoring and a prioritized backlog.

### About the Firebase gap
- **Is Firebase on the auth path?** The imports (`firebase/analytics`) suggest no, but the skill cannot confirm without a maintainer's word. If Firebase IS used for authentication anywhere else in the codebase (e.g., Firebase Auth), the audit findings are incomplete.
- **Should a `firebase` profile be written?** If Firebase will remain in the codebase long-term and is on a security-sensitive path, a profile is worth adding so the next audit covers it.

### About the migration
- **What's driving the Auth0 → Cognito migration?** Compliance, vendor consolidation, cost, technical reasons? This determines whether the migration is "finish it and rip out Auth0 fast" or "long coexistence is acceptable."
- **What's the timeline for completing the migration?** If "next quarter," the Auth0 findings below are about to become moot. If "no timeline, indefinite coexistence," they're load-bearing.
- **Is the new Cognito boundary the target shape long-term?** If yes, the gaps in it (no contract suite, no single-flight refresh, no policy layer, look-alike storage) should be filled before Auth0 is removed.

### Cognito side — specifically
- **Is the storage trap acceptable?** `sessionStorage` is the built-in selector; the storage is not actually swappable. If a future move to HttpOnly cookies is on the table, this needs to change. If not, the "false positive" reading of `setKeyValueStorage(...)` should at least be acknowledged in code review.
- **Is a contract suite worth adding now?** Cheap to add (the bounded fixtures have a template); locks in the boundary against future regressions.

### Auth0 side — specifically
- **Is the opaque-token anti-pattern actually breaking something today?** If the backend rejects these tokens, this is a current bug, not a calcification finding. If it accepts them somehow, the authorization model is informal — that's worth surfacing to security.
- **Cost to retrofit the Auth0 side?** Two files (`auth0-helpers.ts`, `LegacyAdmin.tsx`) plus wiring through the boundary. Small in scope — but worth doing only if the migration is actually being completed (otherwise it's investment in code that's about to be deleted).

**Without answers, the findings above remain observations.** If the maintainer indicates "the migration is being completed in Q3," the prioritized backlog would lead with finishing the Cognito side (add contract suite, fix storage, add policy layer) and then sunsetting the Auth0 surface.

---

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** The opaque-token anti-pattern flagged under Axis 4 (Auth0 side) is a calcification finding (token type calcified to "whatever Auth0 returns by default"); whether it constitutes a real security issue depends on how the backend handles it and is out of scope here.
- **Firebase surface NOT assessed.** No profile available. The skill is honest about this rather than guessing.
- **App ↔ auth boundary only.** Infrastructure, gateways, and IaC out of scope.
- **Findings are evidence-backed observations.** Every finding includes `file:line` evidence.
