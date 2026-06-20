## Auth Calcification — Summary · `fixtures/calcified-cognito`

**AWS Amplify v6 / Cognito.** Run on Opus 4.7, non-interactive.

**Posture: heavily calcified.** No real boundary exists — the [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts) module looks like a wrapper but hands the vendor's `AuthSession` and `AuthUser` types straight back to callers, so the vendor's shape is load-bearing across the app. Every one of the four axes is inherited or scattered. *(High confidence: all 7 source files read in full; no coverage gaps.)*

**Headline:** The vendor's session type and claim names have leaked into application code in 5+ places — `AuthSession` is a component's state type ([src/components/UserBadge.tsx:11](src/components/UserBadge.tsx#L11)), `cognito:groups` is read inline in two separate components ([src/components/UserBadge.tsx:18](src/components/UserBadge.tsx#L18), [src/components/AdminPanel.tsx:15](src/components/AdminPanel.tsx#L15)), and the **ID token** authorizes every API call ([src/api/client.ts:15](src/api/client.ts#L15)). There is no single place to change any of these — each is reached for directly at the call site. That's the definition of calcified: a storage move, a provider swap, or an authz-model change would each touch scattered files, not one adapter.

| Signal | Status | Anchor |
|---|---|---|
| Boundary | Absent — leaky facade, no `AuthPort`, no contract suite | [src/lib/auth-helpers.ts:8](src/lib/auth-helpers.ts#L8) |
| Storage | Inherited default (localStorage) — no v6 `setKeyValueStorage`, no v5 `cookieStorage:`/`storage:` either | [src/lib/amplify-config.ts:5](src/lib/amplify-config.ts#L5) |
| Refresh | Inherited — bare `fetchAuthSession()`, no 401/single-flight/failure path | [src/api/client.ts:14](src/api/client.ts#L14) |
| Provider | Scattered — `cognito:groups`, `fetchUserAttributes`, `custom:*` across 3 files | [src/pages/Profile.tsx:7](src/pages/Profile.tsx#L7) |
| Authorization | Inline claim reads + hard-coded roles; **ID token for API** | [src/api/client.ts:15](src/api/client.ts#L15) |

**Top open questions** *(non-interactive run — no likelihood input, so findings are not ranked):*
1. **Token storage** — is a move off localStorage (e.g. HttpOnly cookies) actually planned? The mechanical evidence shows no custom adapter; the question of whether one is worth writing depends on your roadmap.
2. **Authorization model** — is RBAC/ABAC or an ID→access-token move on the roadmap? The 3 inline claim-reads and 5 hard-coded role strings are cheap to fix *now*, expensive once the model spreads.
3. **Provider swap** — realistic in the next 12-24 months, or is the value purely defensive? Determines whether the boundary work is urgent or optional.

**Only you can decide:** all four likelihood-of-change axes, the true retrofit cost in your system, and any org/ownership constraints. This was a non-interactive run, so nothing was prioritized — answer the questions above (or re-run interactively) to get a ranked backlog.

*Full evidence, per-axis findings, coverage, and recommended seams → [auth-calcification-audit-report.md](auth-calcification-audit-report.md)*
