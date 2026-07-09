## Auth Calcification — Summary · bounded-cognito fixture (harness workspace)

AWS Amplify v6.6.0 (Cognito), React-only client app — no SSR surface. Run on Claude Opus 4.7, non-interactive.

**Posture: well-bounded; near migration-ready across all four axes.** The `AuthPort` in [src/auth/port.ts](src/auth/port.ts#L6) is the seam; vendor imports and Cognito claim names live only inside [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts#L6); a contract suite exercises the port against both a `FakeAuth` and the real adapter. *(High confidence: every application-layer file was read in full, and grep sweeps for the profile's leak patterns returned zero hits outside the adapter.)*

**Headline:** the boundary is fully in place — `aws-amplify` imports, Cognito claim names, and the storage seam live only in [src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts#L6); [__tests__/auth-contract.test.ts:50](__tests__/auth-contract.test.ts#L50) runs the same suite against a `FakeAuth` and the real `CognitoAuthAdapter`; refresh is single-flight with an explicit `onSessionExpired` at [src/api/client.ts:23](src/api/client.ts#L23); API calls carry the **access token** ([src/auth/adapters/cognito.ts:42](src/auth/adapters/cognito.ts#L42)); and authorization decisions run through `can(principal, action)` at [src/auth/policy.ts:13](src/auth/policy.ts#L13). In migration-readiness terms, this codebase is essentially at *"swap provider = new adapter that passes the contract suite."*

| Signal | Status | Anchor |
|---|---|---|
| Boundary | present on B1/B2/B3; B4 not applicable (no SSR) | [src/auth/port.ts:6](src/auth/port.ts#L6) |
| Storage | custom adapter (v6 `setKeyValueStorage`, user-defined class) | [src/auth/adapters/cognito.ts:32](src/auth/adapters/cognito.ts#L32) |
| Refresh | owned — single-flight + explicit expiry route | [src/auth/refresh.ts:6](src/auth/refresh.ts#L6) |
| Provider | localized to one adapter | [src/auth/adapters/cognito.ts:54](src/auth/adapters/cognito.ts#L54) |
| Authorization | policy layer + access-token for API | [src/auth/policy.ts:13](src/auth/policy.ts#L13) |

**Top open questions** *(non-interactive run — no maintainer likelihoods to rank by; these are the axes routed to judgment)*

1. **Is a token storage change actually planned** (HttpOnly cookies, encrypted store, session cookies)? The seam at [src/auth/adapters/cognito.ts:32](src/auth/adapters/cognito.ts#L32) is ready; whether to exercise it is a roadmap call.
2. **Is a provider swap realistic in 12–24 months, and is defensive optionality worth continued investment?** The contract suite at [__tests__/auth-contract.test.ts:50](__tests__/auth-contract.test.ts#L50) means a swap is one new adapter — but "we've paid for the seam" is different from "we'll use it."
3. **Are authorization-model changes coming** (RBAC/ABAC, finer permissions), and do backend contracts assume the current role/token shape? Evolution stays local to [src/auth/policy.ts](src/auth/policy.ts#L13) and the `Principal` shape — but only if backend consumers agree.
4. **Is any other vendor-owned runtime behavior on the roadmap** (Amplify `Hub.listen` for cross-tab / multi-device sign-out propagation is *not* currently wired — deliberate, or deferred)?

**Only you can decide:** the true retrofit cost in your team's context (bandwidth, test coverage beyond the shipped contract suite, adjacent services depending on the current shape) and whether the changes above are actually planned. The mechanical read is *low cost* on every axis; that is not the same as *cheap in your calendar*.

*Full evidence, per-axis findings, coverage, and open questions → [auth-calcification-audit-report.md](auth-calcification-audit-report.md). Machine-readable record → [auth-calcification-audit.json](auth-calcification-audit.json).*
