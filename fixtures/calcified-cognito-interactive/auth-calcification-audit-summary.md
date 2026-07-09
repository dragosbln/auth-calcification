## Auth Calcification — Summary · `fixture-calcified-cognito`

Amazon Cognito via `aws-amplify` v6.6.0 (client-only React SPA; no SSR surface). Run on claude-opus-4-7 (self-reported), interactive; judgment inputs came from a pre-filled `_interview.yaml` file, not a live maintainer conversation.

**Posture: heavily calcified — no real boundary; all four axes leak into app code.** No `AuthPort`, five app-layer files import `aws-amplify/auth` directly, and [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts) is a leaky facade that hands back `AuthSession` unchanged. *(High confidence: this is a small fixture and every source file was read in full; no coverage gaps.)*

**Headline:** Two of the changes already on the roadmap collide with what the code is doing today. The planned HttpOnly-cookie move (next quarter) will silently break refresh — [src/api/client.ts:14](src/api/client.ts#L14) calls a bare `fetchAuthSession()` on every request and Amplify's silent refresh only works while tokens are JS-readable — so own refresh **before** storage moves. And the planned RBAC change has no place to land: authorization is inline `cognito:groups` reads with hard-coded role strings in [src/components/UserBadge.tsx:22](src/components/UserBadge.tsx#L22) and [src/components/AdminPanel.tsx:17](src/components/AdminPanel.tsx#L17), and the outbound `Authorization` header is the ID token at [src/api/client.ts:17](src/api/client.ts#L17) — the access token that would carry finer permissions is never read.

| Signal | Status | Anchor |
|---|---|---|
| Boundary | absent — no `AuthPort`, no contract suite, leaky facade | [src/lib/auth-helpers.ts:8](src/lib/auth-helpers.ts#L8) |
| Storage | inherited default (Amplify v6 localStorage; no `setKeyValueStorage`) | [src/lib/amplify-config.ts:5](src/lib/amplify-config.ts#L5) |
| Refresh | inherited — bare `fetchAuthSession()`; no single-flight; no failure path | [src/api/client.ts:14](src/api/client.ts#L14) |
| Provider | scattered — `cognito:*`, `custom:*`, and `fetchUserAttributes` across three app-layer files | [src/pages/Profile.tsx:15](src/pages/Profile.tsx#L15) |
| Authorization | inline `cognito:groups` reads + hard-coded roles; ID token attached to API calls | [src/api/client.ts:17](src/api/client.ts#L17) |

**Top moves** *(ranked by your likelihood × the audit's cost evidence)*

1. **Introduce the `AuthPort` boundary.** Every planned change needs a seam that doesn't exist — do this first or pay it four times. *High leverage × moderate cost (contained: one port + refactored callers).*
2. **Domain `Principal` + single policy layer; remove inline `cognito:groups` reads and hard-coded role strings.** *Your likelihood: HIGH (RBAC planned) × high cost — nothing to extend, must be built.*
3. **Own refresh (401 interceptor + single-flight + `onSessionExpired`) — must land before the HttpOnly-cookie move.** *Your likelihood: MEDIUM (tied to storage) × moderate cost, but sequencing-critical: unowned refresh silently breaks the day cookies land.*

**Only you can decide:** Does the backend today verify the Cognito **ID token** or accept the **access token**? The client-side swap at [src/api/client.ts:15](src/api/client.ts#L15) is one line — but a two-sided change if the backend is coupled to ID-token claims or `aud`. And for the HttpOnly-cookie move: is there a same-origin server route to attach to, or does infra need to grow one? Both are the roadmap-and-org questions the code can't answer.

*Full evidence, per-axis findings, coverage, and migration-readiness → [auth-calcification-audit-report.md](auth-calcification-audit-report.md)*
