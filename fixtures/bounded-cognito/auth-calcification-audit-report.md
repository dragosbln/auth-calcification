# Authentication Calcification Audit — bounded-cognito fixture (harness workspace)

**Date:** 2026-07-08
**Vendor profile(s) used:** `amplify-cognito.md` (verified 2026-06-17)
**Model used (self-reported):** Claude Opus 4.7
**Mode:** non-interactive
**Skill version:** 1.3.0
**Machine-readable record:** [auth-calcification-audit.json](auth-calcification-audit.json)

## Summary

AWS Amplify v6 (Cognito) is the sole identity provider, and the codebase presents a fully realized boundary: vendor imports, vendor claim names, and the vendor's storage seam live only inside [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts), and a contract suite in [__tests__/auth-contract.test.ts](__tests__/auth-contract.test.ts) exercises the port against both a `FakeAuth` and the real adapter. On every one of the four change axes — storage, refresh, provider, authorization/token type — the bounded shape from the methodology is already in place. Because this run is **non-interactive**, no likelihood or ranking is produced; the questions only the maintainer can answer are listed under *Judgment calls for you*.

## What auth calcification means (for this codebase)

Auth calcification is the degree to which a change that should be local — swap token storage, change refresh, replace the identity provider, move from inline claim reads to a real authorization model — has instead become a cross-cutting rewrite because the vendor's types and behaviors leaked everywhere. This codebase is **well-bounded**: an `AuthPort` interface, vendor types confined to a single adapter, custom storage plugged into the v6 seam, an owned single-flight 401/refresh path, a domain `Principal` produced by the adapter, a single policy function, access-token authorization for the API, and a contract suite that tests the boundary itself. Any of the four future changes below stays local to one or two files — this is what "near-migration-ready" looks like in practice.

## Coverage

- **Comprehensively read** (every relevant region opened): [package.json](package.json), [src/auth/types.ts](src/auth/types.ts), [src/auth/port.ts](src/auth/port.ts), [src/auth/context.tsx](src/auth/context.tsx), [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts), [src/auth/refresh.ts](src/auth/refresh.ts), [src/auth/policy.ts](src/auth/policy.ts), [src/api/client.ts](src/api/client.ts), [src/components/UserBadge.tsx](src/components/UserBadge.tsx), [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx), [src/pages/Profile.tsx](src/pages/Profile.tsx), and [__tests__/auth-contract.test.ts](__tests__/auth-contract.test.ts). The fixture is small enough that every application-layer file was read in full — no sampling was required.
- **Sampled via grep + confirm:** none. Grep sweeps for vendor-specific patterns (`aws-amplify`, `amazon-cognito`, `fetchAuthSession`, `AuthSession`, `AuthUser`, `setKeyValueStorage`, `cognito:`, `custom:`, `typeof window`, `Hub.listen`, `Amplify.configure`, v5 `cookieStorage:` / `storage:` config keys) were run and every hit was confirmed against the full file — no orphan grep-hit counts appear in this report.
- **Not analyzed or low-confidence:** none. No unparseable files, no dynamic imports, no generated code, no additional vendors detected, and no auth-related file was skipped.

## Boundary assessment

- **Anti-corruption layer — present.** Every `aws-amplify*` import lives in [src/auth/adapters/cognito.ts:6–8](src/auth/adapters/cognito.ts#L6): `import { fetchAuthSession, signOut } from "aws-amplify/auth";`, `import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";`, `import type { KeyValueStorageInterface } from "aws-amplify/utils";`. The profile's vendor types (`AuthSession`, `AuthTokens`, `AuthUser`, `FetchUserAttributesOutput`, Amplify's `AuthError`) appear as parameter types, return types, or exported types in **zero** application-layer files.
- **Injected vs imported — present.** `AuthPort` is declared at [src/auth/port.ts:6](src/auth/port.ts#L6). The API client is a factory that accepts the port: [src/api/client.ts:7](src/api/client.ts#L7) — `export function createApiClient(auth: AuthPort) {`. React components read the port via context ([src/auth/context.tsx:22](src/auth/context.tsx#L22)); no component or page imports a vendor.
- **Contract-tested — present.** [__tests__/auth-contract.test.ts:50](__tests__/auth-contract.test.ts#L50) defines `runAuthContractTests(name, makeAdapter)` whose assertions target the domain shape only (line 76 explicitly forbids `cognito:`-prefixed keys on the returned `Principal`). The suite runs against a `FakeAuth` at [__tests__/auth-contract.test.ts:100](__tests__/auth-contract.test.ts#L100) and against the real adapter at [__tests__/auth-contract.test.ts:128](__tests__/auth-contract.test.ts#L128). This is the migration-readiness signal in its cleanest form: swap = new adapter that passes this suite.
- **Client/server split absorbed — not applicable.** This is a React-only client fixture: no `next` / `@aws-amplify/adapter-nextjs` / `aws-amplify/auth/server` imports, no `createServerRunner`, no `runWithAmplifyServerContext`, and no `typeof window`-style branching to obtain auth. The client/server-split concern does not arise here; recorded as *not applicable* rather than *absent* to keep the difference honest.

Because the boundary is present across B1–B3 (and structurally moot on B4), the cost-to-retrofit on every axis below is bounded to one or two files.

## Findings by axis

### Token storage

- **Observation:** Custom storage adapter — a user-defined class implementing `KeyValueStorageInterface` is plugged into the Amplify v6 storage seam. Not the vendor default (`localStorage`), not a built-in selector (`defaultStorage` / `sessionStorage` / `new CookieStorage()`).
- **Evidence:** [src/auth/adapters/cognito.ts:16](src/auth/adapters/cognito.ts#L16) — `class MemoryKeyValueStorage implements KeyValueStorageInterface {`. Plugged in at [src/auth/adapters/cognito.ts:32](src/auth/adapters/cognito.ts#L32) — `cognitoUserPoolsTokenProvider.setKeyValueStorage(new MemoryKeyValueStorage());`. The absence of any Amplify v5 configuration pattern (`Amplify.configure({ Auth: { cookieStorage: ... } })` or `Amplify.configure({ Auth: { storage: <class> } })`) was also verified — the codebase is confirmed v6 by [package.json](package.json).
- **Recommended seam:** already in place. A move to HttpOnly cookies (or any other storage backend) replaces the `MemoryKeyValueStorage` class body without touching a single call site outside the adapter. Note the profile's caveat: `setKeyValueStorage` overrides the TokenStore only; Cognito Identity Pools (`identityId`) would still use `localStorage`. Identity Pool usage was not detected here, so the caveat is structural but not currently triggered.
- **Cost evidence:** **low** — the v6 storage seam is already taken; retrofit is confined to swapping the `MemoryKeyValueStorage` class inside one file (single file, no call-site changes).
- **Likelihood:** see *Judgment calls for you*.

### Refresh and owned runtime behaviors

- **Observation:** Owned — reactive 401 interceptor with single-flight dedup and an explicit `onSessionExpired` failure path. Not inherited vendor magic.
- **Evidence:** the single-flight helper at [src/auth/refresh.ts:6](src/auth/refresh.ts#L6) (`export function refreshOnce(`) with the assignment guard at [src/auth/refresh.ts:9](src/auth/refresh.ts#L9) — `inflight ??= doRefresh().finally(() => {`. The 401 path in [src/api/client.ts:19](src/api/client.ts#L19) — `if (res.status === 401 && (await auth.onRefresh())) {` — retries once, then falls through to [src/api/client.ts:23](src/api/client.ts#L23) — `auth.onSessionExpired();`. The adapter drives refresh explicitly through the helper at [src/auth/adapters/cognito.ts:61](src/auth/adapters/cognito.ts#L61) — `const session = await fetchAuthSession({ forceRefresh: true });` — rather than relying on Amplify's silent auto-refresh. The port declares the explicit expiry route at [src/auth/port.ts:10](src/auth/port.ts#L10).
- **Recommended seam:** already in place. A move to a different refresh strategy (server-side refresh for HttpOnly cookies, for example) changes the adapter's `onRefresh` body and does not require altering call sites.
- **Cost evidence:** **low** — helper, 401 path, and explicit expiry route are all present; retrofit stays inside the adapter.
- **Likelihood:** see *Judgment calls for you*. One sibling behavior *not* wired here is Amplify Hub cross-tab / multi-device sign-out propagation — the profile flags `Hub.listen('auth', …)` as the entry point for that. Absence of a `Hub.listen` call is recorded as an open judgment call rather than a defect, because whether that sibling behavior is needed is a product decision.

### Identity provider

- **Observation:** Localized. Cognito-specific surface (`cognito:groups`, `custom:tenantId`, `aws-amplify` imports, `setKeyValueStorage`) is confined to [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts). The rest of the app speaks the domain shapes from [src/auth/types.ts](src/auth/types.ts).
- **Evidence:** claim names appear only at [src/auth/adapters/cognito.ts:53](src/auth/adapters/cognito.ts#L53) — `tenantId: idPayload["custom:tenantId"] as string | undefined,` — and [src/auth/adapters/cognito.ts:54](src/auth/adapters/cognito.ts#L54) — `roles: (idPayload["cognito:groups"] as string[] | undefined) ?? [],`. A repo-wide search for `cognito:`, `custom:`, `idToken.payload`, `fetchUserAttributes`, and admin-SDK identifiers (`AdminGetUser`, `AdminAddUserToGroup`, `ListUsers`) across `src/components/**`, `src/pages/**`, `src/api/**`, `src/auth/context.tsx`, `src/auth/policy.ts`, `src/auth/refresh.ts`, `src/auth/types.ts`, and `src/auth/port.ts` returned zero application-layer hits.
- **Recommended seam:** already in place. A provider swap = write a sibling adapter (e.g. Auth0) that passes `runAuthContractTests`.
- **Cost evidence:** **low** — vendor imports and claim names live in one file; zero confirmed coupling spread outside the adapter across the searched paths.
- **Likelihood:** see *Judgment calls for you*.

### Authorization (and token type)

- **Observation:** Bounded. Vendor claims are mapped once (inside `getPrincipal`) into a domain `Principal`; authorization decisions run through a single policy function `can(principal, action)`; API calls carry the **access token**, not the ID token — which is the profile's Cognito-hardening default.
- **Evidence (claims / policy):** the roles table at [src/auth/policy.ts:8](src/auth/policy.ts#L8) — `const ROLES: Record<Action, string[]> = {` — and the single decision site at [src/auth/policy.ts:13](src/auth/policy.ts#L13) — `export function can(principal: Principal | null, action: Action): boolean {`. Components ask the policy: [src/components/AdminPanel.tsx:10](src/components/AdminPanel.tsx#L10) — `if (!can(principal, "admin.view")) return null;` — and [src/components/UserBadge.tsx:12](src/components/UserBadge.tsx#L12). Inline claim reads across the app layer: zero (see the identity-provider search above).
- **Evidence (token type):** [src/auth/adapters/cognito.ts:42](src/auth/adapters/cognito.ts#L42) — `const accessToken = session.tokens?.accessToken?.toString();` — and [src/auth/adapters/cognito.ts:43](src/auth/adapters/cognito.ts#L43) — `return accessToken ? { Authorization: \`Bearer ${accessToken}\` } : {};`. The ID token is used only for identity/claim mapping inside `getPrincipal`, not attached to outbound calls.
- **Recommended seam:** already in place. A move to RBAC/ABAC or finer permissions edits the `Principal` shape and [src/auth/policy.ts](src/auth/policy.ts); it does not require a call-site sweep.
- **Cost evidence:** **low** — one policy function is the only authorization site; access token is already the API bearer.
- **Likelihood:** see *Judgment calls for you*.

## Migration-readiness

Not applicable — this run is non-interactive, so no maintainer input indicated a specific change to read the findings forward against. The mechanical picture is nonetheless "substantial to nearly complete" against a provider-swap or storage-swap scenario, because the seams the methodology requires already exist; the maintainer would need to name a specific change to turn that into a proper migration-readiness section.

## Prioritized backlog

Not produced. Prioritization requires the maintainer's likelihood inputs on each of the four axes and this run was non-interactive. Every finding above is evidence-backed and traceable to the [audit JSON](auth-calcification-audit.json); ranking them by leverage needs a human who can say which changes are actually on the roadmap.

Re-run the skill in interactive mode (or provide an answers file) to produce a ranked backlog.

## Judgment calls for you

Because this run was non-interactive, all four interview questions are routed here:

- **Storage (Axis 1) — is a token storage change actually on the table** (HttpOnly cookies, encrypted store, session cookies, other)? The seam already exists at [src/auth/adapters/cognito.ts:32](src/auth/adapters/cognito.ts#L32), so any change stays inside that file. Whether it is worth doing now depends on the roadmap.
- **Refresh (Axis 2) — is owning refresh (or any other vendor-owned runtime behavior — sign-out propagation, multi-tab sync, silent re-auth) on the roadmap independently, or would it move only alongside a storage change?** Refresh, single-flight, and the explicit expiry route are already owned in this codebase; Amplify `Hub.listen('auth', …)` for cross-tab / multi-device propagation is *not* wired — deliberate design choice or deferred item, only you know which.
- **Identity provider (Axis 3) — is a provider swap realistic in the next 12–24 months, and how much vendor-specific behavior (Cognito groups, custom attributes) is acceptable to keep?** The current shape means a swap = one new adapter passing [__tests__/auth-contract.test.ts:50](__tests__/auth-contract.test.ts#L50). Whether that is going to happen — or whether the defensive optionality is worth continued investment — is a roadmap call.
- **Authorization (Axis 4) — are authorization-model changes planned** (RBAC/ABAC, finer-grained permissions), and are any backend contracts assuming the current token/role shape? Access tokens already authorize the backend and one policy function is the sole authorization site, so evolution stays local to [src/auth/policy.ts](src/auth/policy.ts) and the `Principal` shape. Whether the backend will accept those shapes is not visible in this repo.
- **True retrofit cost in your team's context** — bandwidth, test coverage beyond the shipped contract suite, adjacent services depending on the current shape. The mechanical read on every axis above is *low*; that is not the same as *cheap in your calendar*, and time-to-complete is deliberately not something this audit estimates.

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** It assesses changeability, not vulnerabilities. Note in particular that the current storage adapter (`MemoryKeyValueStorage`) is an in-memory fixture stand-in — evaluated here as a swappability signal only; whether it is appropriate for production storage is a security-review question, not a calcification question. Get a real security review for anything storage-safety, XSS/CSRF, or token-lifecycle related.
- App↔auth boundary only; infrastructure, gateways, and IaC were out of scope.
- Findings are evidence-backed observations; no prioritization is produced (non-interactive mode).
- **Cost figures are qualitative (low/moderate/high) and based on mechanical evidence.** Real time-to-complete depends on test coverage, team bandwidth, and the per-app call-site reality you know best.
