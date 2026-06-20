## Auth Calcification — Summary · `fixtures/bounded-cognito`

**AWS Amplify v6 / Cognito.** Run on Opus 4.7, non-interactive.

**Posture: well-bounded.** A real `AuthPort` interface ([src/auth/port.ts](src/auth/port.ts)) and a single adapter ([src/auth/adapters/cognito.ts](src/auth/adapters/cognito.ts)) confine vendor types and claim names entirely. App code traffics only in the domain `Principal` and the `AuthPort`. *(High confidence: all 11 source files read in full; grep confirmed no `aws-amplify` import outside the adapter and no `cognito:`/`custom:` claim names outside it.)*

**Headline:** Storage, refresh, and authorization are all owned in the right places — custom `KeyValueStorageInterface` adapter ([src/auth/adapters/cognito.ts:16](src/auth/adapters/cognito.ts#L16)), single-flight refresh wrapper ([src/auth/refresh.ts:6](src/auth/refresh.ts#L6)) called from the API client's 401 path ([src/api/client.ts:19](src/api/client.ts#L19)), domain `Principal` mapped inside the adapter ([src/auth/adapters/cognito.ts:50](src/auth/adapters/cognito.ts#L50)) with one policy layer ([src/auth/policy.ts:13](src/auth/policy.ts#L13)), and the access token (not the ID token) carries authorization ([src/auth/adapters/cognito.ts:42](src/auth/adapters/cognito.ts#L42)). The contract suite ([__tests__/auth-contract.test.ts:50](__tests__/auth-contract.test.ts#L50)) is what makes this future-proof rather than just well-organized today: a provider swap is "make a new adapter pass this suite," not "rewrite the app."

| Signal | Status | Anchor |
|---|---|---|
| Boundary | Present on all four signals — `AuthPort`, injected, contract-tested (FakeAuth + real adapter) | [src/auth/port.ts:6](src/auth/port.ts#L6) |
| Storage | Custom adapter implementing `KeyValueStorageInterface` (real, not a look-alike selector) | [src/auth/adapters/cognito.ts:32](src/auth/adapters/cognito.ts#L32) |
| Refresh | Owned — single-flight wrapper + 401 retry + explicit `onSessionExpired` failure path | [src/auth/refresh.ts:6](src/auth/refresh.ts#L6) |
| Provider | Localized — `aws-amplify` imports and claim names appear in exactly one file | [src/auth/adapters/cognito.ts:6](src/auth/adapters/cognito.ts#L6) |
| Authorization | Domain `Principal` + single policy layer; **access token** for API | [src/auth/policy.ts:13](src/auth/policy.ts#L13) |

**Top open questions** *(non-interactive run — no likelihood input, so findings are not ranked):*
1. **Storage implementation** — the seam is in place; is a real-world backend (HttpOnly cookies, encrypted store) actually planned, or is the in-memory fixture implementation enough for now? The work to swap is small; the decision is product/security.
2. **Sibling owned behaviors** — sign-out propagation, multi-tab session sync, silent re-auth are not implemented here. The `AuthPort` makes them straightforward to add; the question is whether they're on the roadmap.
3. **Authorization model evolution** — RBAC/ABAC, finer permissions, organizations-style scoping. The policy layer keeps these local; the question is whether the model change itself is coming.

**Only you can decide:** all four likelihood-of-change axes, the true retrofit cost in your system, and any org/ownership constraints. The structural readiness is high — any change is small and local — but "cheap to change" is not the same as "worth changing." Re-run interactively to get a ranked backlog.

*Full evidence, per-axis findings, coverage, and recommended seams → [auth-calcification-audit-report.md](auth-calcification-audit-report.md)*
