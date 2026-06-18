# Authentication Calcification — An Audit Methodology

> Adopt a vendor auth library and you outsource the *implementation* — good. The trap is silently outsourcing the *architecture* too: the library's defaults become load-bearing walls you never decided to build. This document defines how to audit a codebase for that risk. **Rent the hard parts — crypto, MFA, threat detection. Own the seams and the judgment.**

## What "calcification" means

A system is calcified when a change that *should* be local has instead become a cross-cutting rewrite. Swapping token storage, changing how refresh works, replacing the identity provider, switching which token authorizes the backend — each of these should touch one well-defined seam. In a calcified system each touches dozens of call sites, because the vendor's shape leaked everywhere: its session object is the return type, its claim names are read directly, its errors are caught by name.

Calcification is not a vulnerability and it is not a bug. It's a property of the *seams*. Adopting a library is the right move — you should not be writing your own crypto. The failure is letting the library's defaults become your architecture by accident, so that a decision you never consciously made turns out to be expensive to reverse.

## Why this applies to auth specifically

Auth earns more upfront design than almost anything else because it sits on three axes at once:

- **Entry point.** It's the friction the user hits before they're even in the product.
- **Critical path.** It's on *every* authenticated API call — so latency, reliability, and cost are levied on all of them.
- **Highest-value target.** One flaw compromises everything behind it.

A concern that lives on all three of these is worth bounding deliberately. This holds for greenfield systems (where building the boundary in costs almost nothing) and for large production systems (where you do it proactively in a bandwidth window, ahead of a migration you can already see coming). In production there's a bonus: doing this work forces a deeper understanding of the system you already have.

## The method: detect mechanically, escalate the judgment

This is the core stance, and it's what separates a useful audit from a harmful one.

Code can tell you a great deal: whether a boundary exists, where vendor types leak across it, whether refresh is owned or inherited. Code **cannot** tell you whether a given change is actually *likely*, or how *expensive* it would be to retrofit *in this particular organization*. An audit that invents those answers is worse than no audit, because it launders a guess as a finding and the reader can't tell the difference.

So the method keeps the two strictly separate and never fabricates the second. It runs in three movements:

1. **Mechanical pass.** Detect the structural facts and attach evidence — file and line. No scoring yet. These are observations stated as observations.
2. **Judgment interview.** For each axis of change, ask the questions only a human can answer, grounded in what the pass actually found. The answers supply the human inputs to the score.
3. **Composition.** Combine the mechanical evidence with the human's inputs into a prioritized result, where every ranking is traceable back to its inputs. Anything the human couldn't or wouldn't answer is surfaced as an open judgment call — never silently scored.

The non-negotiable: run the method without a human in the loop and it must *refuse* to invent the human axes. It emits the findings and the open questions, flatly, and stops short of a priority ranking. The refusal is the point — it's the difference between a tool that respects the boundary of what it knows and one that doesn't.

A second honesty rule governs the mechanical pass itself: it reports what it could and couldn't see. A dynamically-constructed import it couldn't resolve, a file in a language it didn't parse, a config value injected at runtime — these become stated gaps in coverage, not silent omissions. The pass must never let "I found no problem here" read as "this is clean," because the most dangerous thing an auditor can produce is a false all-clear. Every result carries its coverage: what was analyzed, what was skipped, and how confident each finding is.

And one boundary on what the method *does*, not just what it claims: it reports and proposes, it does not rewrite. The output is a prioritized backlog — per finding, the risk, the evidence (file and line), and the recommended seam — ordered by leverage and scoped so a human, or an agent under supervision, can carry out each task. Auth is a hot path; an automated edit that gets it subtly wrong is exactly the harm this whole approach exists to avoid. Proposing the seam is in scope. Applying it to your auth code is not.

## Scoring: likelihood of change × cost to retrofit

Findings are prioritized on two axes, and which side owns each axis matters:

- **Likelihood of change** — will this part actually move? This is roadmap, org direction, a migration already on the horizon. **Human input.** Code cannot see your plans.
- **Cost to retrofit** — *if* it moves, how expensive is the change in this system? This is where the mechanical pass earns its keep: the quality of the boundary and the spread of vendor coupling are strong *evidence* for cost. But the final estimate is **confirmed by the human**, who knows the true call-site count, the test coverage, and the team.

A finding ranks high only when change is **both** likely AND expensive to retrofit. That conjunction is deliberate — it is the built-in guard against over-engineering (see the counterweights). The mechanical pass *proposes* the cost evidence; the human *owns* both axes.

The same two axes read in reverse give you a **migration-readiness** view, which is often the more useful framing. Instead of only "here is your risk," each axis can report how far along you already are: a codebase with an `AuthPort`, contained claims, and a contract suite is most of the way to a provider swap, and the report can say so — "you're ~80% there; the remaining coupling is these five call sites." Risk and readiness are the same measurement pointed in opposite directions, and a remediation backlog reads very differently when it's framed as the last steps of a migration you've nearly finished rather than a list of sins.

## The boundary is the enabler

Before the four change axes, one structural thing determines the cost on all of them: the boundary. A real boundary makes every downstream change local. Its absence multiplies the cost-to-retrofit on storage, refresh, provider, and authorization alike. So the boundary is assessed first, and its quality feeds the cost estimate for everything that follows.

Most "wrappers" are **leaky facades** — a `lib/auth.ts` that re-exports the vendor's functions but still hands back the vendor's session object, throws the vendor's errors, and uses the vendor's claim names. The vendor's shape passes straight through to every caller. A real boundary does four things a facade doesn't, and each is independently detectable and independently fixable.

**1 — Anti-corruption layer.** The boundary speaks *your* domain types (`Session`, `Principal`, `AuthError`); the vendor's types never cross it.

```ts
// Leaky: the vendor's shape escapes into every caller.
export const getSession = () => fetchAuthSession(); // returns the vendor's session
// Bounded: callers only ever see your types.
export interface AuthPort {
  getAuthHeaders(): Promise<Record<string, string>>;
  getPrincipal(): Promise<Principal | null>;
  onRefresh(): Promise<boolean>;
  onSessionExpired(): void;
}
```

*Detects:* vendor types (e.g. an Amplify `AuthSession`, a Firebase `User`, raw provider claim shapes) appearing in app-layer signatures, return types, or thrown/caught errors. Counts and locates each occurrence.

**2 — Injected, not imported.** Capabilities are injected (`createApiClient(auth)`) rather than reached for via an imported singleton (`import { getToken } from "@/lib/auth"`), which hard-wires every call site to one implementation and is untestable without the network.

*Detects:* auth accessed via a module-level singleton import versus an injected port; presence or absence of an `AuthPort`-style contract.

**3 — Contract-tested.** One conformance suite that every adapter must pass. This is the part almost nobody does, and it's what turns "future-proof" from an aspiration into a definition of done: migration becomes "make the new adapter green," not "swap and pray across the call sites."

*Detects:* a contract/conformance suite written against the boundary, versus tests that mock the *vendor* and assert on the vendor's shape — those pass today and die on migration.

**4 — Absorbs the client/server split.** One port, two adapters (client reads the session one way; server reads from cookies in a server context). Application code never branches on execution context.

*Detects:* app code branching on client-vs-server to obtain auth, versus a single port with context-specific adapters behind it.

*Escalates (for all four):* how many call sites a boundary retrofit would touch in practice, and whether the team has the bandwidth to do it. These inform cost but aren't visible in the code.

## The four change axes

Each axis is a *kind of future change*. Each is scored on likelihood (human) × cost (mechanical evidence, human-confirmed). For each: what it is, what the bounded shape looks like, what the pass detects, and what it must escalate.

### Axis 1 — Token storage

Where tokens live, and whether that's swappable. The highest-leverage way to understand an auth library is to replace its token storage — even reproducing the default forces the right questions (what holds tokens now, where else could they live, how would you switch later). A codebase that has done this has both the understanding and the seam.

*Bounded:* a custom storage adapter plugged into the vendor's storage seam.

*Detects:* where storage is configured, and whether it's the vendor default or a custom adapter. Vendor seams to recognize accurately:
- **Amplify v6** — pluggable key-value storage via `cognitoUserPoolsTokenProvider.setKeyValueStorage({ setItem, getItem, removeItem, clear })`.
- **Auth0 SPA SDK** — a custom `cache` implementing `get`/`set`/`remove` (`ICache`).
- **Firebase** — `setPersistence` *selects* among built-in strategies (`browserLocal`, `browserSession`, `indexedDB`, `inMemory`). It does **not** accept a custom storage backend. Do not report persistence selection as a custom storage adapter; that's a real and easy mistake.

*Escalates:* is a storage change actually likely (e.g. a known move to HttpOnly cookies)? Code can't see the plan.

### Axis 2 — Refresh (and other owned runtime behaviors)

Refresh is the runtime behavior most likely to be inherited as vendor magic and to quietly become load-bearing. A common pattern: the vendor's silent automatic refresh works *only because* tokens live in browser-readable storage; the moment storage moves to HttpOnly cookies, the browser can't read them and that silent client-side refresh breaks all at once.

*Bounded:* reactive refresh on a 401 plus retry, single-flight dedup so that N concurrent 401s trigger one refresh, and an explicit failure path to `onSessionExpired`. (SSR can't write cookies, so server-side refresh lives in middleware — same behavior, different adapter; it's the `onRefresh` slot filled in for a different context.)

```ts
let inflight: Promise<boolean> | null = null;
export function refreshOnce(doRefresh: () => Promise<boolean>): Promise<boolean> {
  inflight ??= doRefresh().finally(() => {
    inflight = null;
  });
  return inflight; // every concurrent caller awaits the same refresh
}
```

Refresh is the lead example, not the whole axis. The same "inherited versus owned" question applies to the other behaviors a vendor quietly handles for you — sign-out propagation across tabs and devices, multi-tab session synchronization, silent re-authentication. Each is fine to inherit right up until the day you need to change it, each calcifies the same way, and each shows up in code as the presence or absence of explicit handling.

*Detects:* inherited vendor refresh (a bare `fetchAuthSession` or equivalent with no explicit handling) versus an owned 401-interceptor with single-flight and a defined failure path; and, more broadly, whether the sibling behaviors above are handled explicitly or left to vendor defaults.

*Escalates:* whether a change to any of these behaviors is coming — refresh changes are usually downstream of a storage move, so the likelihood is a human call.

### Axis 3 — Identity provider

The big one. Provider-specific features leak into application code and raise the switching cost. The boundary doesn't make a provider swap free — vendor-specific behavior always carries some coupling — but it *localizes* that coupling to a single adapter.

*Bounded:* provider-specific usage (groups, custom attributes, admin/management APIs) localized to the adapter; the rest of the app speaks OIDC/OAuth2, not vendor-isms.

*Detects:* vendor-specific feature usage scattered across application code versus localized to the adapter. Counts and locates it.

*Escalates:* is a provider swap realistically on the table? And how much vendor-specific behavior are you willing to keep? Both are roadmap and appetite calls, not code.

### Axis 4 — Authorization (and token type)

"Auth" is authentication *and* authorization, and authorization calcifies just as hard as authentication — it's the half most audits forget. The failure mode: authorization decisions made by reading raw vendor claim shapes directly at the call site — `token["cognito:groups"]`, custom-attribute lookups, hard-coded role and group strings — scattered through components and request handlers. Moving from "roles baked into the token and read everywhere" to a real policy or RBAC/ABAC model is a brutal retrofit precisely *because* the claim-reading is everywhere; there is no single place to change.

This axis carries two related concerns:

- **Claim and role coupling.** Are authorization decisions made by reading vendor claim shapes directly at the call site, or against a domain `Principal` — your roles, your permissions — produced by the boundary, with policy checks in one place?
- **Token type (authn/authz coupling).** Which token authorizes downstream calls — the ID token (identity) or the access token (authorization)? Using the ID token for API authorization couples authentication to authorization; moving to access tokens is a common hardening step, and exactly the kind of change a boundary should make local.

*Bounded:* the boundary produces a domain `Principal` carrying your role and permission vocabulary; authorization decisions go through a policy layer rather than scattered claim reads; access tokens carry authorization to the backend while ID tokens stay for identity.

*Detects:* direct reads of vendor claim shapes (provider-namespaced claims, custom attributes) and hard-coded role/group strings in application code, versus checks against a domain `Principal` or policy layer — counted and located; and which token is attached to outbound API requests (the source of the `Authorization` header).

*Escalates:* whether an authorization-model change is planned (a move to RBAC/ABAC, finer-grained permissions, a shift from ID to access tokens), and what backend contracts depend on the current choice. Code shows the current coupling, not the intent or the blast radius.

## Two counterweights

This methodology is **not** "abstract everything." Two limits keep it honest, and an audit that ignores them is itself a failure mode.

**Don't build auth yourself.** The vendor does the genuinely hard, dangerous work you don't want to own: crypto correctness (hashing, signing, PKCE, timing attacks), the edge-case swamp (MFA, recovery, brute-force lockouts, credential-stuffing and bot defense), compliance and certification, and 24/7 operations on a hot path — your auth down is everything down. Future-proofing is *not* owning auth. Own the seams and the judgment; rent the hard parts. Rent the engine, own the steering.

**Don't over-engineer.** Building seams nobody flexes is over-built for today *and* still wrong for tomorrow, because the future arrives in a shape you didn't predict. Build a seam only where change is both *likely* AND *expensive to retrofit* — which is exactly the scoring conjunction above. You bet on *which* axes move, not on *how* they move. A seam is cheaper than a prediction; flexibility everywhere is its own kind of rigidity, and the discipline is in choosing where.

## Scope

What this methodology covers — and, just as importantly, what it deliberately doesn't.

**In scope:** application-layer auth architecture — the seam between an application and its identity provider or auth library. This applies to any codebase that consumes an IdP, a frontend or a backend service alike.

**Out of scope:** infrastructure, API gateways, IaC, and gateway or Lambda authorizers. These are harder to assess from application code and belong to a different layer with different owners. The methodology stays at the app↔auth boundary, where the signals are legible in the code and the remediation is something the application team can actually own. Keeping the line here is what keeps the audit both tractable and credible.

## Beyond the core: deliberately deferred

A few extensions are valuable but sit outside the core — captured here so they're not lost, and marked clearly so the core stays tractable and the audit doesn't overclaim.

- **Session and identity-model coupling (a conditional axis).** Multi-pool, multi-tenant, and B2B organization-switching logic calcifies the same way: going single-pool → multi-pool, or adding tenant isolation, is expensive when that logic is smeared across the app rather than localized. This is a real axis, but it's more stack-specific than the four core ones, so it's scored only when the system actually has this shape.
- **A drift baseline for CI.** Snapshot the calcification state and diff against it over time — *did this get worse since the last audit.* This is how a team holds the line after the one-time audit is done, and it's the natural bridge to a continuous lint-rule layer that enforces the same definitions the audit applies once.
- **Token storage as a current liability (a tightly-bounded security flag).** The storage axis (Axis 1) is about *changeability*; its safety twin is the present-tense risk that tokens in browser-readable storage (non-HttpOnly cookies, `localStorage`) are exposed to XSS exfiltration, and that a leaked refresh token grants long-lived access. This is worth flagging — but loudly bounded: **this is not a security audit.** It catches one well-understood storage liability and nothing else; a real security review covers everything this deliberately doesn't.

The hard line that stays: this is calcification analysis, not a vulnerability scanner. That space has mature, dedicated tools, and an audit that implied "your auth is secure" off a handful of structural signals would be exactly the irresponsible tooling this method exists to refuse.

## The direction this points

Framed as a direction, not a promise. Done well, the boundary plus owned runtime behaviors plus a genuinely understood vendor push the identity provider toward *config, not architecture*: the boundary speaks OIDC/OAuth2 rather than vendor-isms, you understand the vendor well enough to write a conforming adapter, and you own the volatile behaviors. It is never entirely free — vendor-specific features leak, and the more you lean on them the more coupling stays — but the boundary localizes that coupling to one adapter. If you reach the point where "swap provider" means "a new adapter that passes the contract suite," that is one of the best decoupling points a system can have.
