## Auth Calcification — Summary · `calcified-cognito`

**AWS Amplify v6 (Amazon Cognito)** — `aws-amplify ^6.6.0`, a client-only React SPA. Run on Claude Opus 4.8 (self-reported), non-interactive.

**Posture: heavily calcified — no boundary; the vendor's shape leaks across all four axes.** There is no `AuthPort`, vendor types leak into components and pages, auth is imported directly everywhere, and the only test mocks the vendor. *(High confidence: every source file was read in full; nothing sampled or skipped.)*

**Headline:** The one file that looks like a seam — [src/lib/auth-helpers.ts:8](src/lib/auth-helpers.ts#L8) — hands back Amplify's `AuthSession` unchanged, so the vendor's shape reaches every caller. Combined with the **ID token** (not the access token) going out as the API `Authorization` header at [src/api/client.ts:17](src/api/client.ts#L17), both a provider swap and an authorization-model change are cross-cutting rewrites today, not local edits.

| Signal | Status | Anchor |
|---|---|---|
| Boundary | absent — leaky facade, no `AuthPort`, no contract suite | [src/lib/auth-helpers.ts:8](src/lib/auth-helpers.ts#L8) |
| Storage | inherited default (`localStorage`), Amplify v6 — no `setKeyValueStorage` | [src/lib/amplify-config.ts:5](src/lib/amplify-config.ts#L5) |
| Refresh | inherited — bare `fetchAuthSession()`, no single-flight, no failure path | [src/api/client.ts:14](src/api/client.ts#L14) |
| Provider | scattered — `cognito:*` claims + `fetchUserAttributes` across 3 files | [src/components/UserBadge.tsx:18](src/components/UserBadge.tsx#L18) |
| Authorization | inline claim/role reads; **ID token** authorizes the API | [src/api/client.ts:15](src/api/client.ts#L15) |

**Top open questions** *(non-interactive run — no likelihood input was supplied, so there is no ranked backlog; these are the maintainer's calls):*
1. **Storage move?** — Is a change to HttpOnly cookies / encrypted store on the table? It's also what breaks Amplify's silent refresh.
2. **Own refresh?** — Is a 401-interceptor with single-flight + explicit expiry on the roadmap (usually downstream of a storage move)?
3. **Provider swap / authz change?** — Is leaving Cognito realistic, and are RBAC/finer permissions or an ID→access-token move planned? Both determine whether the scattered coupling above is worth localizing now.

**Only you can decide:** likelihood of change, the true retrofit cost (real call-site count, test coverage, bandwidth), and which backend contracts depend on the current ID-token choice. The audit found the coupling; whether and when to spend on the seams is yours. The skill will not invent those answers or rank without them.

*Full evidence, per-axis findings, coverage, and judgment calls → [auth-calcification-audit-report.md](auth-calcification-audit-report.md)*
