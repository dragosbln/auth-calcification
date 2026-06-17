# BUILD PLAN — Auth Calcification Audit Skill (v1)

This plan is written to be executed by a model working at a modest thinking level. Follow it top to bottom. Each phase ends with a **Done when** checklist — don't move on until it's all true. Where a decision is needed, the rule is given; you should rarely have to invent design.

## 0. Read these first, in this order
1. `methodology.md` (repo root, also bundled at `skill/auth-calcification-audit/references/methodology.md`) — what every signal means and why. This is the source of truth. If a detection's *meaning* is ever unclear, the answer is here.
2. `skill/auth-calcification-audit/SKILL.md` — how the audit runs (three phases).
3. `skill/auth-calcification-audit/references/detection-playbook.md` — how each signal is detected.
4. `skill/auth-calcification-audit/references/vendor-profile-schema.md` and the two profiles in `vendors/`.

### Four rules you must never break (they are the point of the product)
- **Don't fabricate the human axes.** Likelihood-of-change and cost-to-retrofit come from the maintainer, not from you. No human in the loop → emit findings + questions, no priority ranking.
- **No false all-clear.** Always report coverage. "No finding" means "looked and found nothing," never "didn't look."
- **Report, don't rewrite.** Produce a backlog with recommended seams; never edit auth code.
- **Not a security audit.** Assess changeability, not vulnerabilities, and say so.

If any step seems to require breaking one of these, stop and surface it instead.

## 1. What v1 is — and isn't

**v1 is** a Claude skill that audits an application's auth boundary for calcification, works across identity providers via pluggable profiles, ships with **Amazon Cognito/Amplify v6** (base) and **Auth0** (portability proof) profiles, and produces an evidence-backed report + remediation backlog that escalates the judgment it can't make.

**Deferred to later (do NOT build in v1):**
- A "add a new provider" sub-skill / guided generator.
- The ESLint plugin (the always-on mechanical layer).
- CI drift baseline; the conditional session/identity-model axis; broader vendors (Firebase, NextAuth, Better Auth).
- The companion article (written after the skill is good — see §8).
- A polished public README (depends on repo naming, which the owner will decide).

## 2. The shape (already designed — don't redesign)

The skill is built the way the methodology says to build auth: a **vendor-agnostic core** (`SKILL.md` + `detection-playbook.md`) plus **per-vendor profiles** (`vendors/*.md`). The core reads profile fields and never names a vendor. **Adding a provider = adding one profile file.** Preserve this invariant in every change you make.

Current tree:
```
auth-calcification/
├── BUILD-PLAN.md                      ← this file
├── methodology.md                     ← source of truth (IP)
├── skill/auth-calcification-audit/    ← the installable skill
│   ├── SKILL.md                       ← drafted
│   ├── references/
│   │   ├── methodology.md             ← bundled copy of ../../../methodology.md
│   │   ├── detection-playbook.md      ← drafted
│   │   └── vendor-profile-schema.md   ← drafted
│   ├── vendors/
│   │   ├── amplify-cognito.md         ← drafted (verify SDK specifics — Phase B)
│   │   └── auth0.md                   ← drafted (verify SDK specifics — Phase D)
│   └── assets/report-template.md      ← drafted
└── fixtures/                          ← YOU build these (Phase E)
```

## 3. Build phases

### Phase A — Confirm scaffolding
The skill files above are drafted. Read each once and confirm it makes sense to you. Make no changes yet.
**Done when:** you can state, in a sentence each, what `SKILL.md`, the playbook, the schema, and each profile do.

### Phase B — Verify and finalize the Cognito profile
The Cognito profile was drafted from prior knowledge; SDK details may have shifted. Verify the storage seam (`setKeyValueStorage` / `KeyValueStorageInterface`), `fetchAuthSession` options, and the Next.js SSR adapter against **current official Amplify v6 docs**. Correct anything stale. Update the profile's **Verification** line with the package version and today's date.
**Done when:** every identifier in `amplify-cognito.md` is confirmed against current docs and the Verification line is filled.

### Phase C — Read and internalize the orchestration
`SKILL.md` and `detection-playbook.md` are drafted. Your job is not to rewrite them but to be ready to run them and refine them based on test results (Phase G). Confirm the three-phase flow and the locate→confirm discipline are clear.
**Done when:** you can run the audit on a fixture by hand following only these files.

### Phase D — Verify and finalize the Auth0 profile
Same as Phase B, for `auth0.md`: verify the `ICache` interface, `getAccessTokenSilently` options, `cacheLocation` values, and namespaced-claim behavior against **current official Auth0 SDK docs**. Update its Verification line.
**Done when:** every identifier in `auth0.md` is confirmed and the Verification line is filled.

### Phase E — Build the fixtures
Fixtures are small synthetic apps the skill audits. They're how you test, and they double as the article's worked examples. Keep each tiny (a handful of files); they only need enough code to make detectors fire or stay silent. **Do not copy any real/proprietary code.** Build under `fixtures/`:

1. **`calcified-cognito/`** — the "before." Should trip nearly every detector:
   - direct `aws-amplify/auth` imports scattered across several app files (no boundary module);
   - an app function returning Amplify's `AuthSession` / its tokens (vendor type leak);
   - no `setKeyValueStorage` (default localStorage);
   - bare `fetchAuthSession()` used for auth with no 401/refresh ownership;
   - inline `idToken.payload['cognito:groups']` reads and hard-coded role strings in components;
   - the **ID token** attached to outbound API calls;
   - tests that mock `aws-amplify` and assert on its shape.
2. **`bounded-cognito/`** — the "after." Should come back near-clean with high migration-readiness:
   - an `AuthPort` interface returning domain types (`Session`, `Principal`, `AuthError`);
   - a single Cognito adapter; app code uses an injected `createApiClient(auth)`;
   - a custom storage adapter via `setKeyValueStorage`;
   - owned refresh: 401 → single-flight → retry → `onSessionExpired`;
   - claims resolved into a domain `Principal`; policy checks in one place; **access token** for APIs;
   - a contract suite asserting against the `AuthPort` (not the vendor).
3. **`bounded-auth0/`** — the portability proof. The **same** `AuthPort` and app code as `bounded-cognito`, with an **Auth0 adapter** swapped in (custom `ICache`, `getAccessTokenSilently` behind the port, namespaced claims mapped to the domain `Principal`). This is the article's "it travels" example.

Optional 4th if Auth0 detectors look undertested after Phase G: **`calcified-auth0/`** (Auth0 analog of fixture 1).

**Done when:** the three fixtures exist, each compiles/parses, and each deliberately contains (or cleanly avoids) the patterns above.

### Phase F — Confirm the report template
Run a dry compose against `bounded-cognito` by hand and check the report has every template section, including **Coverage** and **Judgment calls for you**. Adjust `assets/report-template.md` only if a section is missing or unclear.
**Done when:** a hand-written report for one fixture fills the template with no empty mandatory sections.

### Phase G — Test and iterate (the main loop)
See §4 for the exact procedure. Run the test prompts against the fixtures, review the outputs with the owner, and refine the **skill** (usually the playbook or a profile) — not the fixtures — based on what's wrong. Repeat until the outputs are trustworthy.
**Done when:** §7 (Definition of done) is satisfied.

## 4. Test procedure (this is Claude.ai — no subagents)

You can't spawn parallel test agents here, so run each test yourself:

1. For each fixture, start fresh, read `SKILL.md`, and run the full three-phase audit on that fixture's path, producing a report. For the interview phase, either ask the owner the questions live, or (if testing alone) take the non-interactive path: emit findings + "Judgment calls for you" and **no ranking**.
2. Save each output under `fixtures/<name>/_audit-output.md` (or a `runs/` folder) so the owner can read it.
3. Present the outputs to the owner and ask for feedback per fixture: does it find what it should, miss nothing, over-flag nothing, and stay honest about coverage and judgment? (Skip baseline/quantitative benchmarking — it needs subagents and isn't meaningful here.)
4. Improve the skill from the feedback. Bias toward fixing the **playbook** (generic detection) and **profiles** (vendor specifics); only touch `SKILL.md` for orchestration issues. Generalize fixes — don't overfit to one fixture.
5. Re-run and repeat.

**Expected per-fixture result:** `calcified-cognito` → many findings across boundary + all four axes, no ranking unless the owner answers the interview. `bounded-cognito` → near-clean, boundary present on all four signals, high migration-readiness. `bounded-auth0` → same near-clean result as `bounded-cognito`, proving the Auth0 profile reads a good boundary correctly.

## 5. Packaging (only at the very end, if a packaging tool is available)
Once §7 is met and the owner is happy, the skill folder `skill/auth-calcification-audit/` can be packaged for install. Don't package a skill that hasn't passed Phase G.

## 6. Known failure modes — read before you start
- **Shallow grep.** Emitting findings from raw matches without reading the code. The locate→confirm rule in the playbook exists precisely to stop this; honor it.
- **False all-clear.** Reporting "clean" when files were skipped. Always fill Coverage.
- **Faking the human axes.** Inventing likelihood/cost so the report looks finished. Forbidden — route them to "Judgment calls for you" instead.
- **Selector-as-adapter error.** Reporting a built-in persistence selector (`cacheLocation`, Firebase `setPersistence`, etc.) as a custom storage adapter. Check each profile's look-alike note.
- **Vendor bleed into the core.** Adding a vendor name to `SKILL.md` or the playbook. All vendor specifics go in profiles.
- **Security overclaim.** Implying the auth is "secure." This tool says nothing about vulnerabilities beyond the one tightly-bounded storage-liability flag (and even that points the maintainer to a real security review).
- **Forcing one vendor's model onto another.** Use each profile's notes (e.g. Auth0's refresh model differs from Cognito's).

## 7. Definition of done (v1)
- Both vendor profiles verified against current docs (Verification lines filled).
- Three fixtures built; each behaves as expected in §4.
- Across the test loop, on the fixtures the skill: finds the real coupling, doesn't over-flag the bounded ones, never emits a false all-clear, never fakes likelihood/cost, and never edits code.
- `bounded-auth0` returns the same near-clean result as `bounded-cognito`, demonstrating portability.
- The owner has reviewed the outputs and is satisfied.

## 8. After v1 (context, not tasks)
- **The article (part 3 of the series).** Lead with the methodology and the honest-tooling story; the skill is the operationalization, introduced second (no top-of-article tool plug). **Auth0 is framed as a demonstration of portability, not the core** — Cognito is the worked stack; Auth0 shows the same boundary travels. Carry the series' "agentic era cuts both ways" thesis: the valuable tools automate mechanical detection and escalate judgment rather than pretending to replace it. As you build, jot down the real decisions and trade-offs — they are the article's material.
- **A provider-adding sub-skill** (guided generation of a new `vendors/*.md`) is a natural follow-up — keep it out of v1.
- Then the lint plugin, the CI drift baseline, and broader vendors, in roughly that order.
