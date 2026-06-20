---
name: auth-calcification-audit
description: >-
  Audit a codebase for authentication calcification risk — how tightly its auth is
  wired to a vendor's defaults (token storage, refresh, identity provider,
  authorization/claims) such that a future change would be expensive to make. Use
  this whenever someone wants to review, audit, assess, or "future-proof" the
  auth / login / identity layer of an application; asks how coupled they are to
  Cognito, Amplify, Auth0, Firebase, or another IdP, or how hard it would be to
  swap providers, change token storage, or change how refresh works; or wants a
  migration-readiness assessment or a remediation backlog for their auth boundary.
  Works across identity providers through pluggable vendor profiles. Produces an
  evidence-backed report that escalates the judgment calls it cannot make instead
  of faking them, and never auto-edits auth code.
parameters:
  - name: interactive
    type: boolean
    default: true
    description: >-
      Run the judgment interview (Phase 2). When true, ask the maintainer
      likelihood-of-change and cost-to-retrofit questions to enable prioritization.
      When false, skip the interview and route all judgment questions to the
      "Judgment calls for you" section with no priority ranking.
---

# Auth Calcification Audit

This skill audits the seam between an application and its identity provider for **calcification**: the degree to which a change that should be local (swap token storage, change refresh, replace the IdP, change which token authorizes the backend, move to a real authorization model) has instead become a cross-cutting rewrite because the vendor's shape leaked everywhere.

`references/methodology.md` is the source of truth for what every signal *means* and why it matters. Read it before auditing. This file tells you how to *run* the audit.

## Non-negotiables (these govern everything below)

1. **Never fabricate the human axes.** Whether a change is *likely*, and how *expensive* it is to retrofit *here*, are not in the code — they are the maintainer's to say. Detect mechanically; ask for the rest. If you run without a human to answer, emit findings and the open questions and **stop short of any priority ranking**.
2. **Never produce a false all-clear.** Report what you analyzed and what you couldn't (unparseable files, dynamic imports, a vendor with no profile). "No finding" must mean "looked and found nothing," never "didn't look."
3. **Report and propose; do not rewrite.** Output a prioritized backlog with recommended seams. Do not edit auth code — auth is a hot path and a subtly-wrong automated edit is the exact harm this exists to prevent.
4. **This is calcification analysis, not a security audit.** Assess changeability, not vulnerabilities. Say so in the report.
5. **Never produce time/effort estimates.** Do NOT emit "1 hour," "2 days," "3 dev-weeks," or any other duration-based estimate. The skill produces *cost evidence* (qualitative: low / moderate / high, with the mechanical justification — boundary quality, spread of coupling, confirmed call-site counts). Time-to-complete depends on the team, test coverage, and bandwidth — that's the maintainer's number, and it belongs in "Judgment calls for you," not in the audit's findings.

## Portability invariant

All provider-specific knowledge lives in `vendors/*.md` profiles. **This file and the playbook never name a specific vendor.** Supporting a new provider = adding one profile file that follows `references/vendor-profile-schema.md`, and nothing else. If you're tempted to special-case a vendor here, that knowledge belongs in a profile.

## The audit — three phases

### Phase 0 — Model self-report (one short check before Phase 1)

Identify the Claude model you are running on. Based on that identification:
- If you are confident you are running on **Opus 4.7 or higher, or Sonnet 4.6 or higher**: proceed silently. No disclaimer needed.
- If you are **uncertain** about your model, OR you can confirm you are running on Sonnet 4.5 or lower, Haiku 4.5 or lower, or any model below Opus 4.7: you MUST **prepend the following disclaimer to the report's Summary section** (Phase 3):
  > **Model disclaimer:** This audit was run on `<self-reported model name>`. The skill is verified against Opus 4.7+ and Sonnet 4.6+; lower tiers have known recall gaps (e.g., missing version-specific configuration patterns the profile documents). Treat these findings as a **first pass** and re-run with a higher-tier model for higher confidence before acting on them.

In every report, regardless of model, include a `**Model used (self-reported):**` line in the report metadata (alongside Date / Vendor profile). Self-identification is imperfect — this line exists so the human reader can verify or correct.

Bias toward including the disclaimer when uncertain. A spurious disclaimer is harmless; a missing disclaimer on a weak-model run is a credibility risk.

### Phase 1 — Mechanical pass (facts, with evidence)
Follow `references/detection-playbook.md` step by step.
- Detect which vendor(s) the codebase uses and load the matching profile(s); record any detected-but-unprofiled vendor as a coverage gap.
- Assess the four **boundary signals**, then the **four change axes**, using the loaded profile's identifiers.
- For every candidate match, **open the code and confirm** before recording it — a vendor type inside the adapter is correct; the same type in app-layer code is a leak. Record each confirmed finding with **file:line** and a one-line reason, and keep a running coverage record.
- **Before declaring any negative finding** (no custom adapter, no policy layer, no contract suite, etc.), check the profile for **alternative patterns** that could satisfy the same concern (e.g., version-specific configuration APIs). One missed pattern = one confidently wrong "no finding."
- Do **not** score likelihood or cost here.

### Phase 2 — Judgment interview (ask what only the human knows)

**If `interactive` is true (default):** Briefly present the findings grouped by axis (one or two sentences per axis is enough — the full report comes in Phase 3), then ask the maintainer the questions the code can't answer.

**How to ask:** Use the `AskUserQuestion` tool — the multiple-choice prompt Claude Code provides natively — to ask the questions **one at a time, in order**. Do NOT batch all four into a single text prompt; the experience is markedly better when questions are presented one-by-one with concrete options. After each answer, briefly acknowledge ("Got it — likely Q3") and move on to the next axis. If the maintainer says "skip" or "stop" mid-flow, accept it and proceed to compose the report with what you have; unanswered axes go to "Judgment calls for you."

For each axis, the `AskUserQuestion` call structure:

**1. Token storage**
- `question`: "Is a token storage change actually on the table? (e.g., a move to HttpOnly cookies, encrypted store, or session cookies)"
- `header`: `Storage change`
- `multiSelect`: false
- `options`:
  - label: `Yes — planned`, description: "Actively planned or in progress"
  - label: `Maybe — discussed`, description: "Discussed but no concrete timeline"
  - label: `No — acceptable today`, description: "Current storage is acceptable; no plans to change"
  - label: `Don't know`, description: "Route this axis to Judgment calls"

**2. Refresh and owned runtime behaviors**
- `question`: "Is owning refresh (401-interceptor + single-flight + explicit failure path) on the roadmap?"
- `header`: `Own refresh`
- `multiSelect`: false
- `options`:
  - label: `Yes — planned`, description: "Independent of any storage change"
  - label: `Tied to storage`, description: "Would happen if/when storage changes"
  - label: `No — vendor refresh is fine`, description: "No plans to change"
  - label: `Don't know`, description: "Route this axis to Judgment calls"

**3. Identity provider swap**
- `question`: "Is a provider swap realistic in the next 12–24 months?"
- `header`: `Provider swap`
- `multiSelect`: false
- `options`:
  - label: `Yes — actively planned`, description: "Migration in progress or scheduled"
  - label: `Likely — being discussed`, description: "On the horizon but not committed"
  - label: `Unlikely, defensive value`, description: "No plans, but optionality is worth investment"
  - label: `No — locked in`, description: "Compliance, contracts, or org reasons rule it out"

**4. Authorization model**
- `question`: "Are authorization model changes planned?"
- `header`: `Authz changes`
- `multiSelect`: true
- `options`:
  - label: `RBAC/ABAC or finer permissions`, description: "Authorization model overhaul"
  - label: `ID → access token`, description: "Token-type fix for API authorization"
  - label: `Neither — current model is fine`, description: "No plans to change"
  - label: `Don't know`, description: "Route this axis to Judgment calls"

After all four answers, the maintainer's input supplies **likelihood**; the mechanical pass supplied **cost evidence** (boundary quality, spread of coupling, call-site counts). For any answer of "Don't know," route that axis to "Judgment calls for you" without forcing a likelihood.

**If `interactive` is false:** Skip the interview entirely. Do NOT call `AskUserQuestion`. Route every question above into the "Judgment calls for you" section of the report with no priority ranking. This is the non-interactive mode — useful for CI runs, batch audits, or when you want findings without being prompted.

### Phase 3 — Compose (the report)

Fill `assets/report-template.md` with: report metadata (Date, Vendor profile(s), Model used self-reported, Scope), Summary, **What auth calcification means** (a short tailored explanation — see template), Coverage (comprehensive vs sampled, plus all gaps), Boundary assessment (4 signals), Findings by axis (each with evidence + recommended seam), Migration-readiness for any change the maintainer flagged, Prioritized backlog ordered by leverage with each rank traceable to *(mechanical evidence × the maintainer's likelihood/cost)*, "Judgment calls for you," and the Scope/disclaimers block.

**Cost language:** Use qualitative descriptors only — **low**, **moderate**, **high** — always grounded in concrete mechanical evidence (e.g., "moderate — three call sites bypass the boundary; the seam exists in one file"). **NEVER emit time estimates** ("1 hour," "2 days," "3 dev-weeks," etc.). Time-to-complete is the maintainer's number; it goes in "Judgment calls for you," not in findings (see non-negotiable #5).

**Code in the report:** Describe seams in prose. Optional: tiny illustrative snippets (≤5 lines) clearly framed as *illustration, not a patch*. Do not write applicable code; the skill does not produce edits to auth code (non-negotiable #3).

**Link every file reference (both artifacts).** A `file:line` written as bare text is dead weight in a rendered markdown file. Every file and `file:line` reference — in the report's evidence lines, coverage paths, backlog scope, AND in the summary's scorecard anchors and headline — must be a **clickable markdown link**:
- Format: `[<display>](<href>)`, where `<display>` is the human-readable `path:line` (e.g. `src/lib/auth-helpers.ts:8`) and `<href>` uses the **`#L<line>`** convention so the link works in VS Code's markdown preview AND on GitHub — e.g. `[src/lib/auth-helpers.ts:8](src/lib/auth-helpers.ts#L8)`. The `path:line` form in the href is a Claude Code chat-only convention; in a saved markdown file it produces broken links in VS Code and GitHub.
- Because both artifacts are saved at the **root of the audited scope**, express hrefs relative to that root (the same root your findings already cite). A reference to the sibling report/summary file is just its filename: `[auth-calcification-audit-report.md](auth-calcification-audit-report.md)`.
- A range or whole-file reference drops the line suffix: `[src/auth/](src/auth/)`.
- No bare `path:line` text anywhere in either file. If you cite it, link it.

Prioritize **only** with the maintainer's inputs; show which inputs were theirs. Recommend seams; don't apply them.

The skill produces **two artifacts, in this order**: the full report first, then a summary **distilled from the report**. Generate them in that order — the summary must contain nothing that isn't in the report, and every number/anchor in the summary must match the report.

**Artifact 1 — the full report.** Fill `assets/report-template.md` as described above. Save to the target directory:
- Default path: `<target>/auth-calcification-audit-report.md`
- If that path already exists, save as `<target>/auth-calcification-audit-report-2.md`, `-3.md`, etc. — next available integer. Do NOT overwrite; the previous run is the maintainer's record.

**Artifact 2 — the summary.** Distill `assets/summary-template.md` from the report you just wrote. This is the lead artifact — the one the maintainer reads first and the one that earns or loses their trust. Save it alongside the report:
- Default path: `<target>/auth-calcification-audit-summary.md`
- If that path already exists, use the next available integer (`-2.md`, etc.). Keep the suffix aligned with the report (if the report became `-report-2.md`, the summary is `-summary-2.md`).

Do not negotiate either path with the user mid-flow; the convention is deterministic.

**Model disclaimer:** if the Phase 0 self-report triggered the disclaimer condition, prepend it to **both** the report Summary and the top of the summary file.

**Presentation — chat output for Phase 3:**
- Do **not** print the report or the summary into chat. Do **not** recap findings axis-by-axis.
- After both files are saved, **open the summary file as a preview** (so it renders directly for the user) and stop. The summary is the lead; the report is the deep-dive it points to.
- A single trailing line is acceptable only if a preview cannot be surfaced: `Summary → <summary path> · Full report → <report path>`.

The files are the artifacts; the chat is not a second copy of them.

## Chat verbosity discipline (governs all phases)

The chat output during a run should be sparse. Default to silence; speak only at consequential moments.

**During Phase 0:** silent unless the model disclaimer applies — if so, one line.

**During Phase 1:** do NOT narrate every grep, every file read, or every confirmed finding. Speak in chat only at these moments:
- Initial vendor detection and profile load: one line ("Detected: `<vendor>` v`<version>`. Loaded profile."). If multiple vendors, list them.
- Genuine pivots: a vendor was detected without a profile available (coverage gap), a partial-boundary situation requires per-vendor assessment, an unparseable code region forced a coverage gap.
- The transition into Phase 2: one line ("Mechanical pass complete. Starting interview.").

**During Phase 2:** ask one `AskUserQuestion` at a time. Between questions: brief acknowledgments (≤1 sentence). No findings recap — the recap is the report.

**During Phase 3:** write both files (report, then summary distilled from it), then open the summary as a preview. No findings dump in chat. See the Phase 3 "Presentation" block above.

**Never** describe what you are about to do in chat. Just do it.

## Where things live
- `references/methodology.md` — why each signal matters (source of truth).
- `references/detection-playbook.md` — how to detect each signal from a profile (the mechanical pass).
- `references/vendor-profile-schema.md` — the structure every profile follows; read this to add a provider.
- `vendors/*.md` — per-provider knowledge (currently `amplify-cognito.md`, `auth0.md`).
- `assets/report-template.md` — the full report structure (artifact 1).
- `assets/summary-template.md` — the one-screen summary distilled from the report (artifact 2, the lead).

## Common mistakes to avoid
- **Grepping and stopping.** A text match is a candidate; the finding requires reading the code around it. Skipping the confirm step produces the shallow checklist this skill is meant to replace.
- **Negative finding from a single grep pattern.** A profile may document multiple ways the same concern manifests (e.g., a vendor's v5 vs v6 storage configuration uses entirely different APIs). Searching only one pattern and declaring absence is a false negative. Detect the version first, then check the matching patterns.
- **Confusing a built-in persistence selector with a custom storage adapter** (see each profile's look-alike note). This is a real accuracy trap.
- **Forcing one vendor's framing onto another** (e.g. Cognito's silent auto-refresh onto Auth0's more explicit model). Use the profile's notes.
- **Scoring without the human, or implying "secure."** Both violate the non-negotiables above.
- **Time/effort estimates.** Don't write "1 hour," "2–3 dev-weeks," or any duration. Cost is qualitative (low/moderate/high) with mechanical justification; time-to-complete is the maintainer's number. See non-negotiable #5.
- **Walls of text in chat.** The report is the artifact. Chat should be tight: vendor detected → save path → 1-paragraph headline. The "Chat verbosity discipline" section is binding.
