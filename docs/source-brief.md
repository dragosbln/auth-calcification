# Context handoff — Auth Calcification Skill + companion article (part 3)

## About this file

This is a **context-only** briefing for a new session that will (1) build an agentic skill auditing a codebase for "authentication calcification risk," and (2) write an article around it — **part 3 of an existing series**. It carries forward everything relevant from the session where parts 1 and 2 were written.

Deliberately omitted (provided separately):

- **Who Dragos is / objectives / tone** — an improved professional-context MD will be attached in the new session. This file does not duplicate it. (One anchor that the rest of this doc relies on: Dragos's frame is _"the judgment doesn't get outsourced; the typing does"_ — the skill must embody it.)
- **Instructions / task steps for the new session** — Dragos will write those.

Everything below is _context_: the series so far, the articles in detail, the skill concept and the decisions already made about it, and the constraints that govern the writing.

---

## 1. The series — what it is and its through-line

A series turning real, internal auth-architecture work (done at "Pie Insurance," an enterprise B2B insurance platform) into public artifacts on **dev.to** (technical, code-heavy) with **LinkedIn** companion posts (narrative/opinion). It is _backlog-conversion_ of past work — and a vehicle for Dragos's positioning as an independent architect/advisor and for the emerging "agentic architecture review" engagement format.

**Overarching through-line (the spine — reuse it in part 3):**

> Adopt a vendor auth library and you outsource the _implementation_ — good. The trap: you silently outsource the _architecture_ too. The library's defaults become load-bearing walls you never decided to build. Future-proofing isn't predicting the future; it's keeping the steering wheel in your hands while still renting the engine. **Rent the hard parts (crypto, MFA, threat detection). Own the seams and the judgment.**

**dev.to series name:** `Auth architecture in production` (set in frontmatter `series:` so dev.to auto-links the parts; part 3 should use the same).

---

## 2. Article 1 — full context

**Status:** published on dev.to; a narrative companion post published on LinkedIn.
**Title:** "Securing auth in a large-scale production system: three industry-standard architectures — and why none survived a closer look"
**Opening H2:** "Context: a hot-path problem"

**Thesis.** Architectural thinking alone can't pick the right path; you must dive into _implementation_ detail to see the whole picture. The same pattern is right in one constraint stack and wrong in another ("the pattern is not the verdict; the pattern + constraint stack is"). A legitimate senior outcome of an architecture review is sometimes "keep the current flawed pattern — with documented foundation work, an explicit risk acceptance, and a defined migration trigger." _Acceptance from depth is not acceptance from ignorance._

**Quotable lines (his, keep the voice):**

- "Architecture is a discipline you do all the way down to implementation depth, or it's not architecture — it's a slide deck."
- "Acceptance from depth is not acceptance from ignorance."

**The real story.** A penetration test flagged Cognito tokens stored in non-HttpOnly cookies (JS-readable → XSS exfiltration; leaked refresh token → near-indefinite access). "Just enable HttpOnly" looked like a config toggle but touched six layers at once (frontend framework, token storage, API routing, gateway authorizer, every downstream service, hosting cost). The team had _deliberately accepted_ the vulnerability because the fix had calcified into a months-long re-architecture across 100+ services — then did foundation work to make the eventual fix a config flag.

**The constraint stack (concrete, reusable — this is the substance, keep the numbers):**

1. Next.js App Router, heavy Server Components, hybrid client/server fetching.
2. ~100+ backend microservices, all expecting `Authorization: Bearer <id_token>`; API Gateway validates JWT from the `Authorization` header. Uniform contract on purpose — change **all or none**.
3. Hosting on **Vercel, which bills serverless functions by wall-clock time including time spent waiting on slow downstream calls** (a 5s hung request bills 5s, every time).
4. **~65–70% of API calls are made directly from the client**; proxying all client calls through Next.js roughly doubles proxied volume.
5. Cognito JWTs are large (ID tokens ~1–2KB+); browser cookie limit ~4KB/cookie, gateway header budget ~8KB → **HTTP 431** in production if tokens go in cookies naïvely.
6. Amplify v6 HttpOnly support for Next.js is **experimental**, and requires Cognito Managed Login.

**The four paths (3 "industry-standard" + the chosen deferral):**

1. **Next.js BFF proxy** — client calls route through Next.js route handlers/Server Actions; tokens stay server-side in HttpOnly cookies; Next.js attaches Bearer downstream. (Auth.js/NextAuth's default shape; AWS Premium Support's _first_ recommendation.) **Rejected:** Vercel wall-clock cost on 65–70% of traffic; **structural Vercel lock-in** — 100% of API traffic flows through Next.js, tying the auth hot path to one host and making a future host migration a re-architecture.
2. **Token-broker BFF + session DB** — a dedicated Lambda reads an opaque session cookie, looks up the session in a DB, forwards Bearer downstream. (The architecture **Better Auth** promotes with an external OIDC provider; has a stateless cookie variant too.) **Rejected:** the decisive objection was **"you now own the entire auth substrate"** (DB + session mechanism to build/patch/scale/on-call); session DB becomes a hot path on 100% of calls; DB choice is a one-way door (DynamoDB vs Aurora+RDS Proxy vs ElastiCache); observability fragments across two runtimes.
3. **API Gateway Lambda authorizer reading cookies** — gateway reads the credential from a cookie, validates (e.g. `aws-jwt-verify` against Cognito JWKS), injects Bearer downstream; authorizer responses cached (~300s). (AWS Premium Support's _revised_ recommendation.) **Rejected this round** for: (a) **cookie size / 431**; (b) **refresh migrates into the auth infra** — the cleanest variant is a **dedicated refresh route handler the client calls on 401** (this became the _target future state_); and decisively (c) **org-shaped reason**: the Lambda authorizer was another team's, and that team had an active **RBAC initiative** — wrong timing to start a cross-team rewrite.
4. **Conscious deferral + foundation work** (chosen). Kept non-HttpOnly cookies + XSS mitigations; **migrated old Amplify (self-hosted login pages, structurally HttpOnly-incompatible) → Amplify v6 `ssr:true` + Cognito Managed Login** (the version whose experimental HttpOnly feature exists), converting the eventual fix from a re-architecture into a config flag; wrote a **stakeholder-signed risk acceptance**; defined the **migration trigger** (sunset of legacy frontends tied to the old auth + the parallel RBAC initiative as the alignment window); captured the research so the next person doesn't redo it.

**Key reusable insights:**

- "Map options against your real constraint stack, not against feature checklists."
- **Architecture is org-shaped** — the right technical path can be blocked by ownership/timing, not technology; name it explicitly in the analysis and design today's decision around the moment the timing flips.
- Distinguish **stateful complexity** from **feature complexity** (and ownership cost is underestimated at decision time).
- Distinguish **mitigation** from **elimination** (name what you reduced vs. what you merely moved).
- **Foundation moves:** modernize the substrate now so the future fix is a flag, not a re-architecture.
- **Vendor support is an input, not a conclusion** — AWS Premium Support gave **two different recommendations across two cases** (BFF first; later Lambda-authorizer + stateless cookie), both correct under different assumptions. Framed constructively, never as a swipe at AWS.

**Diagrams (exist as `.drawio`):** current non-HttpOnly flow, plus one per path (BFF, token broker, gateway authorizer), plus the chosen Path 4 (current flow + the Amplify v6 / Cognito Managed Login foundation overlaid).

---

## 3. Article 2 — full context (maps almost 1:1 onto the skill's audit dimensions)

**Status:** published on dev.to (part 2 of the series, code-heavy).
**Title:** "3 ways to future-proof your authentication system"
**Subtitle:** "Your auth library's defaults quietly become your architecture. Here's how to stay in control — while still renting the hard parts from people who specialize in them."
**Opening H2:** "Auth is the ultimate hot path."

**Why auth earns the effort (the hot-path argument, 3 axes at once):** entry point (UX/friction before the user is even in the product); critical path of _every_ authenticated API call (latency, reliability, cost levied on all of them); highest-value security target (one flaw compromises everything). A concern on all three axes earns more upfront design than almost anything else.

**Framing on applicability (kept concise in the article):** applies to greenfield (building it in costs almost nothing) _and_ to large production systems (do it proactively in bandwidth windows, ahead of a move you can see coming); in production there's a bonus — doing this work forces deeper understanding of the system you already have.

### The three ways (these are essentially the skill's rubric)

**Way 1 — Own the boundary (make it more than a leaky facade).**
Most "wrappers" are **leaky facades**: a `lib/auth.ts` that re-exports the vendor's functions but still returns the vendor's session object, throws the vendor's errors, uses the vendor's claim names — so the vendor's shape passes through to every call site. A real boundary does four things a facade doesn't:

- **(1) Anti-corruption layer** — speaks _your_ domain types (`Session`, `Principal`, `AuthError`); vendor types never cross it. Good vs bad:
  ```ts
  // ❌ Leaky: the vendor's shape escapes into every caller.
  export const getSession = () => fetchAuthSession(); // returns Amplify's AuthSession
  // ✅ Bounded: callers only ever see your types.
  export interface AuthPort {
    getAuthHeaders(): Promise<Record<string, string>>;
    getPrincipal(): Promise<Principal | null>;
    onRefresh(): Promise<boolean>;
    onSessionExpired(): void;
  }
  ```
- **(2) Capabilities injected, not imported** — an imported singleton (`import { getToken } from "@/lib/auth"`) hard-wires every call site to one implementation; inject an `AuthPort` into `createApiClient(auth)` instead → swappable per execution context, testable with zero network.
  ```ts
  export function createApiClient(auth: AuthPort) {
    return async function apiFetch<T>(
      url: string,
      init: RequestInit = {},
    ): Promise<T> {
      const call = async () =>
        fetch(url, {
          ...init,
          headers: { ...init.headers, ...(await auth.getAuthHeaders()) },
        });
      let res = await call();
      if (res.status === 401 && (await auth.onRefresh())) res = await call(); // refresh → retry
      if (res.status === 401) {
        auth.onSessionExpired();
        throw new Error("Session expired");
      }
      return res.json();
    };
  }
  ```
- **(3) Contract-tested** — _the centerpiece; the part almost nobody does._ One conformance suite every adapter must pass; migration becomes "make the new adapter green," not "swap and pray across 100 call sites." Turns "future-proof" from aspiration into a definition of done. The ❌ counterexample is tests that mock the _vendor_ and assert on the vendor's shape (they die on migration); the ✅ is `runAuthContractTests(makeAdapter)` asserting only on the `AuthPort` contract.
- **(4) Absorbs the client/server split** — same `AuthPort`, two adapters (client reads session one way; server reads from cookies in server context); app code never branches on execution context. (Big Next.js pain that the boundary dissolves.)

**Way 2 — Know your tools deeply enough to replace them.**
Understand a library by _extending_ it, not reading its quickstart. Highest-leverage exercise: **replace its token storage** — even reproducing the default forces the right questions (what holds tokens now, where else could they live — localStorage/cookie/HttpOnly/memory, tradeoffs, how to switch later) and yields a concise, explicit artifact the whole team benefits from (no digging through docs/guesswork). Vendor seams (keep wording accurate):

- **Amplify v6**: pluggable key-value storage via `cognitoUserPoolsTokenProvider.setKeyValueStorage({ setItem, getItem, removeItem, clear })`.
- **Auth0** SPA SDK: a custom `cache` implementing `get`/`set`/`remove` (ICache).
- **Firebase**: lets you _select_ among persistence strategies (`browserLocal`, `browserSession`, `indexedDB`, `inMemory`) via `setPersistence` — NOT custom storage. (Do not let this get "upgraded" to "custom storage.")
  Storage is just the lead example; the same "extend it to understand it" move applies to: swapping in a custom HTTP client, hooking the refresh cycle, subscribing to lifecycle events, plugging in a custom credentials provider. Deliverable is the _understanding_ that lets you write an adapter you trust and spot which defaults are about to become walls.

**Way 3 — Own your critical runtime behaviors, starting with refresh.**
Vendor-magic refresh quietly becomes load-bearing. Concrete example used: Amplify's `fetchAuthSession()` refreshes silently/automatically — but only because tokens live in browser-readable cookies (the XSS root problem from article 1); the moment you move to HttpOnly cookies, the browser can't read them and that silent client-side refresh breaks all at once. Own it: reactive refresh on 401 + retry, **single-flight dedup** so N concurrent 401s trigger one refresh, explicit failure path → `onSessionExpired`.

```ts
let inflight: Promise<boolean> | null = null;
export function refreshOnce(
  doRefresh: () => Promise<boolean>,
): Promise<boolean> {
  inflight ??= doRefresh().finally(() => {
    inflight = null;
  });
  return inflight; // every concurrent caller awaits the same refresh
}
```

SSR can't write cookies → server-side refresh belongs in middleware (same behavior, different implementation — it's the `onRefresh` slot from Way 1, filled in). Generalizes to other inherited behaviors: multi-tab session sync, sign-out propagation, silent re-auth. Honest note: vendor refresh is genuinely fine for many apps; you spend this effort _because_ auth is a hot path with a migration on the horizon.

### The payoff section — "The direction this points: a replaceable identity provider"

Framed as a _direction, not a promise._ Done well, the three ways push the IdP toward config-not-architecture (boundary speaks OIDC/OAuth2 not vendor-isms; you understand the vendor enough to write a conforming adapter; you own the volatile behaviors). **Never entirely free** — vendor-specific features (Cognito groups, custom attributes, admin APIs) leak, and the more you lean on them the more coupling stays; the boundary _localizes_ that coupling to one adapter. If you reach "swap provider = new adapter passing the contract suite," that's one of the best decoupling points a system can have.

### The two counterweight sections (the maturity signal — keep both)

- **"So why not just build auth myself?"** No. The vendor does the genuinely hard, dangerous work you don't want to own: crypto correctness (hashing, signing, PKCE, timing attacks); the edge-case swamp (MFA, recovery, brute-force lockouts, credential-stuffing/bot defense); compliance/certification (SOC 2 + audits); 24/7 ops on a hot path (your auth down = everything down). Callback to article 1's Path 2 (owning the substrate sank it). Synthesis: future-proofing ≠ owning auth; own the seams and judgment, rent the hard parts. **Rent the engine, own the steering.**
- **"The opposite failure: over-engineering."** Don't abstract everything / build seams nobody flexes / reproduce the vendor "just in case" → over-built for today AND wrong for tomorrow (future arrives in an unpredicted shape). Build seams only where change is both **likely** AND **expensive to retrofit** (token storage, refresh, provider qualify; most things don't). You bet on _which_ axes move, not _how_. "A seam is cheaper than a prediction. Flexibility everywhere is its own kind of rigidity; the skill is choosing where."

### The agentic section (VERBATIM — part 3 directly extends this)

> ## The agentic era cuts both ways
>
> The calcification trap predates AI, but coding agents make it faster and more pervasive — for a structural reason. An agent reaches for the vendor's documented happy path: `import { signIn } from "vendor"`, used in-line, no boundary, vendor-magic refresh. It optimizes for "it compiles and ships," not "still changeable in two years," and it won't weigh future-changeability unless you tell it to. So the patterns that calcify now get generated at volume — often by people scaffolding auth they don't fully understand. What used to happen one developer at a time now happens across a codebase before anyone makes a conscious architectural decision.
> But the same agent that defaults to the calcified version is also the cheapest way you've ever had to build the resilient one. The `AuthPort`, the adapter, the conformance suite, the single-flight refresh — the mechanical work that used to be the reason teams _skipped_ the boundary ("no time for all that abstraction") — is now nearly free to generate. The cost that justified cutting the corner has collapsed.
> So the balance tips toward doing the three ways, not away. The architecture doesn't change; the effort moves. The judgment stays yours — where the seams belong, which axes are live, what's likely _and_ expensive enough to bound. The typing is the agent's. The newly essential discipline is **encoding your intent so the agent stays inside it**: a boundary spec it builds against, the contract suite as its target, lint rules that fail the build when a vendor type leaks past the line.
> _(I'm building a skill that audits a codebase for exactly this — missing boundaries, leaking vendor types, inherited refresh — and proposes a backlog to fix them. A follow-up to this series; follow along if it's useful.)_

That parenthetical is the _only_ forward reference to the skill. The skill is intentionally a **separate beat**, not bundled into article 2's launch.

### Article 2 takeaways (bulleted at the end of the piece)

A wrapper isn't a boundary; inject auth as capability not singleton; contract-test the boundary; understand the library by extending it (token storage = highest-leverage); own volatile runtime behaviors (refresh first, single-flight, explicit failure); these moves point toward a replaceable IdP (not free, but coupling localized); future-proofing is NOT building auth yourself (rent the hard parts); don't over-rotate (seams only where change is likely AND expensive; bet on which axes move, not how).

**Article 2 diagrams (exist as `.drawio`):** ports-and-adapters (app → `AuthPort` → swappable Cognito/Auth0/Fake adapters → vendors, with an "anti-corruption boundary" line); the refresh sequence (Call site → API client → AuthPort → Backend: request → 401 → single-flight onRefresh → retry → 200 → data; note "if refresh fails → onSessionExpired → redirect"). The refresh diagram was converted from Mermaid to draw.io because **dev.to doesn't render Mermaid reliably**.

---

## 4. The skill — context, current leanings, and open questions

> **This section is input for planning, not a finalized plan.** The skill and its article have NOT been spec'd yet — Dragos wants to discuss and refine both in the new session before any building. What follows is the thinking that already happened: the concept, the leanings, the guidance/warnings worth carrying in, and the open questions still to resolve. Treat the leanings as strong defaults to pressure-test, not requirements to execute. Plan first, then implement.

### Concept

An agentic skill that audits a codebase for **authentication calcification risk** — how hard-wired the auth system is to vendor defaults, such that a future change (token storage, refresh mechanism, identity provider, token type) would be expensive. It would flag issues, describe the risk, and propose a remediation plan/backlog — possibly with tasks structured for sub-agent execution. (Exact shape, surface, and packaging are open — see open questions below.)

### Scope — current leaning: the app↔auth boundary

Leaning toward **application-layer auth architecture: the seam between the app and its IdP/auth library.** Sharper than both options Dragos floated:

- Broader than "frontend" — applies to any codebase consuming an IdP (frontend _or_ a backend service talking to Cognito/Auth0).
- NOT infra/gateway/IaC/Lambda-authorizers — harder to analyze statically AND _not Dragos's demonstrated artifact_ (he handed off the backend/infra work). Staying app-layer keeps it tractable and credible.

### The quality bar (the make-or-break — critical guidance from the prior session)

Reputational math is **asymmetric**: a great skill compounds the articles' credibility; a _mediocre_ one drags them down, because the highest-intent reader (who finished 3,000 words) will run it and judge by its output. The naive failure mode — grep for `localStorage`/`document.cookie`, emit a shallow checklist — is **worse than no skill**.

The version worth building does mechanical detection well **and explicitly escalates the judgment it cannot make** — it must NOT pretend to assess what only a human can. This humility is the differentiator and the literal embodiment of _"automate the typing, escalate the judgment."_

**CAN detect (mechanical, in-code) — mapped to the three ways:**

- _(Way 1)_ Boundary presence/absence — direct vendor-SDK imports scattered across app files vs a single interface/adapter module (count + locate).
- _(Way 1)_ Leaky-facade signals — vendor types in app-layer signatures/returns (Amplify `AuthSession`, Firebase `User`, raw Cognito claim shapes); vendor errors thrown/caught in app code.
- _(Way 1)_ Injected vs imported — auth accessed via imported singleton vs injected capability; presence/absence of an `AuthPort`-style contract.
- _(Way 1)_ Contract tests — is there a conformance suite for the auth boundary, or only vendor-mocked tests?
- _(Way 2)_ Token storage — where configured; vendor default vs a custom storage adapter (swappability indicator).
- _(Way 3)_ Refresh ownership — inherited vendor magic (e.g., bare `fetchAuthSession`) with no explicit handling, vs an owned 401-interceptor/refresh with single-flight + failure path.
- _(+1)_ Provider coupling — vendor-specific features (Cognito groups, admin APIs, custom attributes) scattered vs localized to an adapter.
- _(token-type)_ ID token vs access token used for API authorization (authn/authz coupling — a secondary objective from the original re-architecture work).

**CANNOT judge — must surface as "questions only you can answer," never silently score:**

- Whether a given change is actually _likely_ (roadmap/org context).
- Whether it's _expensive to retrofit_ in this specific system.
- Org-state — who owns the gateway, team bandwidth, competing initiatives (the "architecture is org-shaped" point).
- Cost models (e.g., Vercel wall-clock billing).

### Output shape (discussed)

- A **calcification risk report**, scored per axis (storage / refresh / provider / token-type) on the **likelihood-of-change × cost-to-retrofit** framing from article 2's over-engineering section.
- Per finding: the risk, the **evidence (file/line)**, the recommended seam.
- A **prioritized remediation backlog** (introduce boundary, write adapter, add contract tests, own refresh), ordered by leverage; optionally tasks structured for **sub-agent execution**.
- A clearly separated **"judgment calls for you"** section listing what was deliberately not scored, and why.

### Format — current leaning: a three-layer split (the methodology is the real IP)

Leaning toward shipping these as distinct layers rather than one monolithic skill (open to revisiting):

1. **Methodology / rubric** — the calcification framework as a doc. The durable IP and differentiator; don't let "skill" overshadow it.
2. **Lint rules** — the always-on mechanical subset as an ESLint plugin (e.g., no vendor-SDK imports outside the auth adapter; no vendor types in app-layer signatures). More robust + CI-integratable than an agent re-deriving each run. (Dragos's day-job project already has linter-rule conventions / a `writing-linter-rules` skill — he's comfortable here.)
3. **Agentic skill** — the interactive audit + report + backlog generation.

### Publishing — current leaning

- Open-source **GitHub repo** (portable artifact serving consultancy + visibility).
- **Do NOT frame it as "like Karpathy's skills repo"** — a single-skill repo from a less-known author invites unfair comparison. Present it as its own thing. (Karpathy repo referenced only as a packaging example: `https://github.com/multica-ai/andrej-karpathy-skills`.)
- **Decoupled launch:** build to the escalate-the-judgment bar first; launch as its own beat (own LinkedIn post) when genuinely good; then retrofit live links into articles 1 & 2 (replacing the "coming soon" parenthetical).

### Open questions to resolve when planning (non-exhaustive)

- Skill surface/runtime: a Claude/agent skill, a CLI, an MCP server, or a combination? What does "run the audit" actually look like for a user?
- Where the line sits between the lint-rule layer and the agentic layer — what's mechanically enforced vs. what needs an agent's read of intent.
- How findings are scored/presented without overclaiming (the likelihood × cost framing needs human input — how is that elicited, not faked?).
- How much it tries to _fix_ vs. _report_ — does it generate a backlog only, or also sub-agent-executable remediation? How far is too far before it stops being trustworthy?
- Which stacks/vendors to support first (Amplify/Cognito is the demonstrated one; Auth0/Firebase/NextAuth/Better Auth as breadth).
- Repo scope and naming; what "v1 that's good enough to attach to the articles" must include vs. defer.

---

## 5. The companion article (part 3) — angle and what's open

**Lead framing Dragos wants (the spine of part 3):** _building a skill while avoiding the hype train._ The story is how he tried to build it **grounded and realistic** — making sure it actually delivers value rather than just promising it (or, worse, making things worse). This is a meta-piece about responsible agentic tooling: the discipline of building an AI tool that's honest about what it can't do, escalates judgment instead of faking it, and earns trust rather than riding hype. It fits his anti-hype positioning exactly (skeptical of "AI roadmap content recycled at premium prices"; "earn signals, don't claim them"; "the judgment doesn't get outsourced; the typing does"). The skill's own design principle (mechanical detection + explicit judgment-escalation, "a mediocre skill is worse than no skill") _is_ the article's argument made concrete.

This is a strong angle and well-aligned — but the article, like the skill, is **not spec'd yet**. Treat the below as material to shape it, not a fixed outline.

- Candidate angles/titles (to refine): something foregrounding "grounded / anti-hype / actually delivers value," with the skill as the worked example. Working stand-ins: "Building an agentic skill without riding the hype train"; "I built an AI auth-auditor and tried hard to make it honest." (Refine with Dragos.)
- **Sequencing principle to keep:** lead with the methodology/judgment and the honest-tooling story; present the skill as the operationalization — same "earn first, offer the tool second" approach used in articles 1 & 2 (no top-of-article tool plug).
- **Relationship to the series:** directly extends article 2's "agentic era cuts both ways." Thesis to carry: _in the agentic era, the valuable tools automate mechanical detection and escalate judgment — they don't pretend to replace it._ The skill is the proof, and it demonstrates the "agentic architecture review" engagement format Dragos wants to sell.
- Use the same dev.to `series: "Auth architecture in production"` metadata.

---

## 6. Series style & confidentiality constraints (specific to this work — non-negotiable)

- **Confidentiality:** everything derives from internal work at **Pie Insurance**. Abstract Pie out completely — "a large-scale production system," "an enterprise B2B platform," "100+ microservices." No client names, internal URLs, real pool IDs, `policyNumber`/`billing-info` examples, or `partner.pieinsurance.com`-style domains. **Do not publish anything correlating the specific vulnerability to Pie** (it would expose a real org's security posture — the insurance-industry mention was deliberately removed from article 1 for this reason).
- **No "senior move" / "the senior way is…" language.** Let the text demonstrate seniority; never self-label. Confident tone.
- **Code examples short and concise** (≤ ~15 lines, illustrative not copy-paste-complete) — explicit preference.
- **AWS support angle stays constructive** ("vendor support is an input, not a conclusion"); never a swipe at AWS.
- **CTA pattern (consistent across the series):** soft Luckylabs pitch at the END only — e.g., "If your team is about to make an expensive-to-reverse decision in auth, cloud, or platform architecture and wants an independent second pair of eyes, that's the kind of work I take on through Luckylabs."
- **Diagrams:** use **draw.io** (dev.to doesn't render Mermaid reliably), export PNG/SVG. Series color scheme: blue `#dae8fc/#6c8ebf` = browser/client/app; green `#d5e8d4/#82b366` = your code (boundary/AuthPort); orange `#ffe6cc/#d79b00` = glue/adapters/gateway; purple `#e1d5e7/#9673a6` = external vendor/backend; yellow note `#fff2cc/#d6b656`; solid arrows = request/call, dashed gray = response/return. Watch for **bare `&` in draw.io XML** (must be `&amp;`, including inside `<diagram name="...">`) — it caused an import parse error before.

---

## 7. Source materials on disk

In `/Users/dragosbilaniuc/Downloads/`:

- `dragos-professional-context-v3.md` — (older) professional context; the new session will get an improved version.
- `aws_1.txt`, `aws_2.txt` — AWS Premium Support transcripts: the two cases (HttpOnly remediation; Lambda authorizer patterns incl. caching; token-broker/DynamoDB/Aurora guidance; stateless encrypted cookie + Secrets Manager/`kid` rotation; access-token-vs-ID-token advice; the "most AWS-supported" recommendation; Managed Login terms-docs/branding limits).
- `Authentication flow redesign.pdf` — the option diagrams (current flow + options A–D / 1–3) with advantages/disadvantages and design annotations.

Frontend ADRs in `/Users/dragosbilaniuc/Projects/pie/Frontend/documentation/adrs/`: 0002 (Amplify auth), 0012 (Cognito Managed Login), 0013 (token storage), 0014 (token access pattern — thin `getClientIdToken`/`getServerIdToken` wrappers over `fetchAuthSession`), 0015 (route protection via middleware), 0016 (multi-pool Cognito strategy).

Confluence (Pie), authored by Dragos:

- "FE Auth foundation research" (page 4993810439) — framework comparison (direct API / `amazon-cognito-identity-js` / Amplify v6 / Better Auth); token storage & access; the **SDK auth-contract / 401-interceptor options** (the `createApiClient({ getAuthHeaders, onRefresh, onSessionExpired })` injected-client pattern; method-wrapper `withAuthRetry`; Proxy/Reflect service wrapper; no-interceptor; plus middleware refresh for SSR and a note on Server Components not being able to set cookies); auth state management (Context vs MobX — out of scope for the skill but part of the research).
- "Authentication system re-architecture" (page 4982636563) — objectives: fix non-HttpOnly storage, stop exposing the refresh token, **move ID→access tokens for backend auth**, update the ancient Amplify; constraints: avoid proxying client calls through Next.js/Vercel (cost), keep performance/reliability since auth is on every call (hot path).

> The full text of articles 1 & 2 was produced in the prior session (both now published on dev.to, with LinkedIn companion posts). The summaries in §2–§3 capture every reusable concept, framing, quotable line, and code snippet; if verbatim drafts are needed, get them from Dragos or the dev.to URLs.
