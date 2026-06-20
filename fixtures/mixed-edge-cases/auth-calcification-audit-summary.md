## Auth Calcification — Summary · `fixtures/mixed-edge-cases`

**AWS Amplify v6 / Cognito + Auth0 SPA v2** (federates separately to two IdPs — codebase mid-migration). **`firebase` also present, but no profile exists in this skill — that surface is NOT assessed, recorded as a coverage gap rather than silently dropped.** Run on Opus 4.7, non-interactive.

**Posture: mid-migration, split per vendor.** The new Cognito path through [src/auth/](src/auth/) has a real boundary (one adapter, domain types ready) — **but trips the look-alike storage trap**: `setKeyValueStorage` is called with `sessionStorage` from `aws-amplify/utils`, which is a built-in selector, NOT a custom adapter ([src/auth/adapters/cognito.ts:24](src/auth/adapters/cognito.ts#L24)). The legacy Auth0 path through [src/legacy/](src/legacy/) and [src/components/LegacyAdmin.tsx](src/components/LegacyAdmin.tsx) is calcified — leaky facade, direct vendor imports, inline namespaced-claim reads, hard-coded roles. *(High confidence on what was assessed; explicit gap on Firebase.)*

**Headline:** The Auth0 side trips a **provider-specific anti-pattern**: `createAuth0Client` is configured with no `audience` ([src/legacy/auth0-helpers.ts:10](src/legacy/auth0-helpers.ts#L10)) and `getTokenSilently()` is called with no `audience` either ([src/legacy/auth0-helpers.ts:25](src/legacy/auth0-helpers.ts#L25)) — per Auth0's docs, that means the returned token is opaque (non-JWT), not a valid API access token. Whatever this is being sent to either rejects it as not-a-JWT or accepts an opaque blob informally; either way it's a calcification finding worth surfacing now, before the migration locks in around it.

| Signal | Status | Anchor |
|---|---|---|
| Boundary | **Split** — Cognito side PRESENT (no contract suite); Auth0 side ABSENT (vendor types leak, direct imports) | [src/auth/port.ts:6](src/auth/port.ts#L6) / [src/legacy/auth0-helpers.ts:5](src/legacy/auth0-helpers.ts#L5) |
| Storage | Cognito: **built-in selector** (sessionStorage), NOT a custom adapter — look-alike trap. Auth0: no storage configured | [src/auth/adapters/cognito.ts:24](src/auth/adapters/cognito.ts#L24) |
| Refresh | Cognito: owned shape, **no single-flight**. Auth0: inherited, no 401 path | [src/auth/adapters/cognito.ts:46](src/auth/adapters/cognito.ts#L46) / [src/legacy/auth0-helpers.ts:25](src/legacy/auth0-helpers.ts#L25) |
| Provider | Cognito: localized. Auth0: scattered across 2 files | [src/legacy/auth0-helpers.ts:5](src/legacy/auth0-helpers.ts#L5) |
| Authorization | Cognito: domain-`Principal`-ready, no policy layer yet. Auth0: inline namespaced-claim reads + hard-coded roles; **opaque-token anti-pattern** | [src/components/LegacyAdmin.tsx:18](src/components/LegacyAdmin.tsx#L18) |

**Top open questions** *(non-interactive run — no likelihood input, so findings are not ranked):*
1. **Firebase coverage gap** — `firebase` is imported at [src/lib/firebase-analytics.ts:8](src/lib/firebase-analytics.ts#L8); the imports observed are analytics-only, but no `firebase` profile exists in this skill so the surface was not assessed. Is Firebase used for auth elsewhere in the broader codebase? If yes, this audit is incomplete and a Firebase profile should be added before the next run.
2. **The Auth0 opaque-token anti-pattern ([src/legacy/auth0-helpers.ts:10](src/legacy/auth0-helpers.ts#L10))** — is the backend rejecting these tokens today (current bug) or accepting an opaque blob informally (latent risk)? Either answer reframes how urgent the Auth0-side work is.
3. **Migration intent and timeline** — Auth0 → Cognito completion makes the Auth0-side findings about-to-be-deleted; indefinite coexistence makes them load-bearing. Cannot be inferred from code.

**Only you can decide:** all four likelihood-of-change axes per vendor, the true retrofit cost in your system, the org/ownership state around the migration, and whether Firebase needs a profile. The structural readiness on the Cognito side is high *except* for the storage look-alike; the Auth0 side needs both a boundary and the `audience` fix regardless of what else is planned. Re-run interactively to get a ranked backlog.

*Full evidence, per-axis findings, coverage, and recommended seams → [auth-calcification-audit-report.md](auth-calcification-audit-report.md)*
