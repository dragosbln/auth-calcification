## Auth Calcification — Summary · `bounded-auth0` fixture

`@auth0/auth0-spa-js` v2 (pure SPA, React 18). Run on `claude-opus-4-7`, non-interactive.

**Posture: well-bounded across all four axes and B1–B3; B4 not applicable (pure SPA).** Every mechanical seam the methodology asks for is present: `AuthPort` contract, single adapter file holding all Auth0 knowledge, contract suite exercising the port. *(High confidence: 11 source files + the test file were read comprehensively; no sampling, no unparseable regions, no coverage gaps.)*

**Headline:** Auth0 v2 is well-bounded here — the SDK import lives in one adapter file ([src/auth/adapters/auth0.ts:14](src/auth/adapters/auth0.ts#L14)), a custom `ICache` holds token storage ([src/auth/adapters/auth0.ts:23](src/auth/adapters/auth0.ts#L23)), refresh is interceptor-owned with single-flight ([src/api/client.ts:19](src/api/client.ts#L19)), and API calls carry the access token with `audience` configured ([src/auth/adapters/auth0.ts:79](src/auth/adapters/auth0.ts#L79)) so the opaque-token / ID-token-for-API anti-pattern is structurally unreachable. The one item worth naming without maintainer input: `MemoryCache` is fixture-grade in-memory storage; the seam to swap it exists but the intended production `ICache` is not yet written.

| Signal | Status | Anchor |
|---|---|---|
| Boundary | present — `AuthPort` + adapter + contract suite; B4 not applicable (pure SPA) | [src/auth/port.ts:6](src/auth/port.ts#L6) |
| Storage | custom `ICache` adapter (v2 `cache:` option, not `cacheLocation`) — `MemoryCache` today | [src/auth/adapters/auth0.ts:65](src/auth/adapters/auth0.ts#L65) |
| Refresh | owned — 401 interceptor + single-flight + explicit failure path | [src/api/client.ts:19](src/api/client.ts#L19) |
| Provider | localized — every Auth0 surface confined to one adapter file | [src/auth/adapters/auth0.ts:14](src/auth/adapters/auth0.ts#L14) |
| Authorization | policy layer + access token with `audience` (real JWT, not opaque, not ID token) | [src/auth/policy.ts:13](src/auth/policy.ts#L13) |

**Top open questions** *(non-interactive run — no likelihood input, no ranking; these are the axis questions the audit deliberately did not answer)*

1. **Storage — is a real production `ICache` planned?** `MemoryCache` at [src/auth/adapters/auth0.ts:23](src/auth/adapters/auth0.ts#L23) is fixture-grade; the seam is right, the destination may not be. *Swap cost: low (single-file change).*
2. **Identity provider — is a swap realistic, or is Auth0 locked in?** The adapter localization means a swap is cheap mechanically ([__tests__/auth-contract.test.ts:47](__tests__/auth-contract.test.ts#L47) makes "done" checkable), but the value depends on likelihood. *Adapter swap cost: low.*
3. **Authorization — RBAC / permissions / Organizations on the roadmap?** Current policy is a role-string→action map at [src/auth/policy.ts:8](src/auth/policy.ts#L8); extending to permission-scoped decisions is cheap inside `policy.ts` + `Principal`. *Extension cost: low.*

**Only you can decide:** whether `MemoryCache` at [src/auth/adapters/auth0.ts:23](src/auth/adapters/auth0.ts#L23) is a placeholder or the intended production store, whether a provider swap is on the horizon, and whether the current role-string policy needs to grow into permissions/RBAC. The mechanical picture is clean; the priorities aren't in the code.

*Full evidence, per-axis findings, coverage, and judgment calls → [auth-calcification-audit-report.md](auth-calcification-audit-report.md). Machine-readable record → [auth-calcification-audit.json](auth-calcification-audit.json).*
