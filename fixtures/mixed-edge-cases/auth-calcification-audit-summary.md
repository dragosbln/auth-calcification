# Auth Calcification — Summary · `mixed-edge-cases fixture`

`aws-amplify` v6.6.0 + `@auth0/auth0-spa-js` v2.1.0, mid-migration from Auth0 to Cognito; Firebase v10.7.0 present but detected as analytics-only (no auth profile available). Run on Claude Opus 4.7, non-interactive.

**Posture: mid-migration — Cognito side bounded but incomplete; Auth0 side calcified.** The two surfaces are at different stages, so the assessment is split per vendor rather than collapsed to one verdict. *(High confidence: every relevant file was read comprehensively — the audited scope is small; the coverage gap is Firebase, deliberately unassessed because no profile exists.)*

**Headline:** The Cognito surface has a real boundary — `AuthPort`, an adapter with vendor types confined, access token attached, and a 401-retry path — but three gaps stop it short of fully bounded: storage uses the built-in `sessionStorage` selector at [src/auth/adapters/cognito.ts:22](src/auth/adapters/cognito.ts#L22) (the look-alike trap, not a custom adapter), refresh has no single-flight dedup around [src/api/client.ts:18](src/api/client.ts#L18), and no contract suite exists. Meanwhile the Auth0 legacy path is calcified: `User` crosses into a component at [src/components/LegacyAdmin.tsx:9](src/components/LegacyAdmin.tsx#L9), a namespaced-claim URL key is read inline at [src/components/LegacyAdmin.tsx:17](src/components/LegacyAdmin.tsx#L17), and `getTokenSilently()` at [src/legacy/auth0-helpers.ts:31](src/legacy/auth0-helpers.ts#L31) is called with no `audience` — which per the Auth0 profile yields an opaque token, the documented anti-pattern for API auth.

| Signal | Status | Anchor |
|---|---|---|
| Boundary | **Split** — Cognito present (no contract suite); Auth0 absent (leaky facade + direct imports) | [src/auth/port.ts:6](src/auth/port.ts#L6) · [src/legacy/auth0-helpers.ts:5](src/legacy/auth0-helpers.ts#L5) |
| Storage | Cognito: built-in `sessionStorage` selector (v6, look-alike trap, NOT custom adapter) · Auth0: vendor default (in-memory) | [src/auth/adapters/cognito.ts:22](src/auth/adapters/cognito.ts#L22) |
| Refresh | Cognito: partially owned (401 path present, no single-flight) · Auth0: inherited via `getTokenSilently` | [src/api/client.ts:18](src/api/client.ts#L18) · [src/legacy/auth0-helpers.ts:31](src/legacy/auth0-helpers.ts#L31) |
| Provider | Cognito: localized to adapter · Auth0: scattered (namespaced claim + `User` type in components) | [src/components/LegacyAdmin.tsx:17](src/components/LegacyAdmin.tsx#L17) |
| Authorization | Cognito: `Principal` without policy layer, access token used · Auth0: inline role checks + opaque API token (no `audience` — documented anti-pattern) | [src/components/LegacyAdmin.tsx:19](src/components/LegacyAdmin.tsx#L19) · [src/legacy/auth0-helpers.ts:31](src/legacy/auth0-helpers.ts#L31) |

**Top open questions** *(non-interactive mode: no likelihood input was captured, so no ranking — these are the questions a follow-up interactive run would ask, in order.)*
1. **Auth0 audience / access-token fix** — [src/legacy/auth0-helpers.ts:31](src/legacy/auth0-helpers.ts#L31) uses an opaque token; is the fix (add `authorizationParams: { audience }` and route API auth through the access token) already tracked separately? It moves independently of any broader authz change.
2. **Auth0 → Cognito migration finish line** — is the Auth0 side dying or staying? If dying, migration completion is the remediation; if staying, its calcification at [src/components/LegacyAdmin.tsx](src/components/LegacyAdmin.tsx) and [src/legacy/auth0-helpers.ts](src/legacy/auth0-helpers.ts) needs the same boundary treatment as Cognito.
3. **Cognito boundary completion** — three concrete gaps (custom `KeyValueStorageInterface` implementation, single-flight refresh dedup, contract suite over `AuthPort`) close the boundary that's already 80% present at [src/auth/port.ts:6](src/auth/port.ts#L6) and [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts). Priority depends on your likelihood-of-change on storage and refresh.

**Only you can decide:** whether the Auth0 side is dying (migration completes → most of its calcification retires with it) or staying (its axes need the same boundary treatment as Cognito), and whether Firebase Auth is used anywhere the audit didn't cover — Firebase is in `package.json` at [src/lib/firebase-analytics.ts](src/lib/firebase-analytics.ts) for analytics only, but with no `vendors/firebase.md` profile the skill cannot assess a broader auth footprint.

*Full evidence, per-axis findings, coverage, and judgment calls → [auth-calcification-audit-report.md](auth-calcification-audit-report.md). Machine-readable record → [auth-calcification-audit.json](auth-calcification-audit.json).*
