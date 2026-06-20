## Auth Calcification — Summary · `fixtures/bounded-auth0`

**Auth0 SPA SDK v2.** Run on Opus 4.7, non-interactive.

**Posture: well-bounded — and the portability proof.** A real `AuthPort` interface ([src/auth/port.ts](src/auth/port.ts)) with a single Auth0 adapter ([src/auth/adapters/auth0.ts](src/auth/adapters/auth0.ts)) confines vendor types and namespaced-claim URLs entirely. App code traffics only in the domain `Principal` and the `AuthPort`. **Nine app-layer files are byte-identical to bounded-cognito** (verified by `diff`) — only the adapter, package.json, and the mocked vendor in the contract test differ. *(High confidence: all 11 source files read in full; grep confirmed no `@auth0/*` import outside the adapter and no namespaced-claim URL outside it.)*

**Headline:** This is what "the boundary travels" looks like once it's done. The same nine files that work behind a Cognito adapter in the sibling fixture work behind an Auth0 adapter here, with the *same* `runAuthContractTests` suite passing against both ([__tests__/auth-contract.test.ts:50](__tests__/auth-contract.test.ts#L50)). On Auth0's two best-known traps: storage is a real custom `ICache` ([src/auth/adapters/auth0.ts:23](src/auth/adapters/auth0.ts#L23)), NOT the `cacheLocation` selector; and `audience` is configured ([src/auth/adapters/auth0.ts:42](src/auth/adapters/auth0.ts#L42), [src/auth/adapters/auth0.ts:79](src/auth/adapters/auth0.ts#L79)), so `getAccessTokenSilently()` returns a real JWT API access token — Auth0's opaque-token anti-pattern correctly avoided.

| Signal | Status | Anchor |
|---|---|---|
| Boundary | Present on all four signals — `AuthPort`, injected, contract-tested (FakeAuth + real adapter) | [src/auth/port.ts:6](src/auth/port.ts#L6) |
| Storage | Custom `ICache` implementation (real, not the `cacheLocation` look-alike selector) | [src/auth/adapters/auth0.ts:65](src/auth/adapters/auth0.ts#L65) |
| Refresh | Owned — single-flight wrapper + 401 retry + explicit `onSessionExpired` failure path | [src/auth/refresh.ts:6](src/auth/refresh.ts#L6) |
| Provider | Localized — Auth0 imports, namespaced claims, `audience` config appear in exactly one file | [src/auth/adapters/auth0.ts:10](src/auth/adapters/auth0.ts#L10) |
| Authorization | Domain `Principal` + single policy layer; **access token** for API with `audience` set | [src/auth/policy.ts:13](src/auth/policy.ts#L13) |

**Top open questions** *(non-interactive run — no likelihood input, so findings are not ranked):*
1. **Storage implementation** — the seam is in place; is a real-world backend (HttpOnly cookies, encrypted store, server-side cache) actually planned, or is the in-memory `ICache` fixture implementation enough for now?
2. **Sibling owned behaviors** — sign-out propagation, multi-tab session sync, silent re-auth. Auth0 does not provide automatic multi-tab sync; the `AuthPort` makes adding it straightforward, but it's not implemented today.
3. **Authorization model evolution** — RBAC/ABAC, Auth0 Organizations, finer permissions. The policy layer keeps these local; the question is whether the model change itself is on the roadmap.

**Only you can decide:** all four likelihood-of-change axes, the true retrofit cost in your system, and any org/ownership constraints. The structural readiness is high — any change is small and local — but "cheap to change" is not the same as "worth changing." Re-run interactively to get a ranked backlog.

*Full evidence, per-axis findings, coverage, and recommended seams → [auth-calcification-audit-report.md](auth-calcification-audit-report.md)*
