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

## Portability invariant

All provider-specific knowledge lives in `vendors/*.md` profiles. **This file and the playbook never name a specific vendor.** Supporting a new provider = adding one profile file that follows `references/vendor-profile-schema.md`, and nothing else. If you're tempted to special-case a vendor here, that knowledge belongs in a profile.

## The audit — three phases

### Phase 1 — Mechanical pass (facts, with evidence)
Follow `references/detection-playbook.md` step by step.
- Detect which vendor(s) the codebase uses and load the matching profile(s); record any detected-but-unprofiled vendor as a coverage gap.
- Assess the four **boundary signals**, then the **four change axes**, using the loaded profile's identifiers.
- For every candidate match, **open the code and confirm** before recording it — a vendor type inside the adapter is correct; the same type in app-layer code is a leak. Record each confirmed finding with **file:line** and a one-line reason, and keep a running coverage record.
- Do **not** score likelihood or cost here.

### Phase 2 — Judgment interview (ask what only the human knows)

**If `interactive` is true (default):** Present the findings grouped by axis, then ask the maintainer the questions the code can't answer, grounded in what you found. Per axis:
- **Token storage:** "Is a storage change actually on the table — e.g. a move to HttpOnly cookies?"
- **Refresh / owned behaviors:** "Is a change to refresh or related behaviors coming (often downstream of a storage move)?"
- **Identity provider:** "Is a provider swap realistically possible in the next year or two? Roughly how many call sites would it touch? How much vendor-specific behavior are you willing to keep?"
- **Authorization / token type:** "Is an authorization-model change planned (RBAC/ABAC, finer permissions, ID→access token)? What backend contracts depend on the current choice?"

Their answers supply **likelihood** and confirm **cost** (you provide the mechanical cost evidence — boundary quality, spread of coupling — they own the number).

**If `interactive` is false:** Skip the interview entirely. Route every question above into the "Judgment calls for you" section of the report with no priority ranking. This is the non-interactive mode — useful for CI runs, batch audits, or when you want findings without being prompted for input.

### Phase 3 — Compose (the report)
Fill `assets/report-template.md`:
- Summary, **coverage**, boundary assessment, findings by axis (each with evidence + recommended seam), **migration-readiness** for any change the maintainer flagged, a **prioritized backlog** ordered by leverage with each rank traceable to *(mechanical evidence × the maintainer's likelihood/cost)*, a **"Judgment calls for you"** section, and the scope/disclaimer block.
- Prioritize **only** with the maintainer's inputs; show which inputs were theirs. Recommend seams; don't apply them.

## Where things live
- `references/methodology.md` — why each signal matters (source of truth).
- `references/detection-playbook.md` — how to detect each signal from a profile (the mechanical pass).
- `references/vendor-profile-schema.md` — the structure every profile follows; read this to add a provider.
- `vendors/*.md` — per-provider knowledge (currently `amplify-cognito.md`, `auth0.md`).
- `assets/report-template.md` — the output structure.

## Common mistakes to avoid
- **Grepping and stopping.** A text match is a candidate; the finding requires reading the code around it. Skipping the confirm step produces the shallow checklist this skill is meant to replace.
- **Confusing a built-in persistence selector with a custom storage adapter** (see each profile's look-alike note). This is a real accuracy trap.
- **Forcing one vendor's framing onto another** (e.g. Cognito's silent auto-refresh onto Auth0's more explicit model). Use the profile's notes.
- **Scoring without the human, or implying "secure."** Both violate the non-negotiables above.
