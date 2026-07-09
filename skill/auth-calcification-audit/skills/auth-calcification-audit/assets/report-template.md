# Calcification Audit Report — Template

Fill this exactly. Every section is load-bearing for honesty: the metadata makes the run traceable, the coverage section prevents a false all-clear, the evidence makes findings checkable, the "judgment calls" section keeps the human axes from being faked, and the disclaimers bound what was and wasn't assessed. Omit a section only if you replace it with an explicit "not applicable, because…".

**Important framing rules:**
- **This template is a VIEW of `auth-calcification-audit.json`.** Render from that JSON alone — never from the codebase, never from memory of the analysis. Every claim (finding, status, anchor, count) traces to a JSON node; prose may explain and connect, never add claims. If the JSON cannot fill a section, fix the JSON first, then re-render.
- **No time estimates anywhere.** Cost is qualitative — **low**, **moderate**, or **high**, each grounded in concrete mechanical evidence. Never write "1 hour," "2 days," "3 dev-weeks," etc. (SKILL.md non-negotiable #5.)
- **No applicable code.** Tiny illustrative snippets (≤5 lines) are allowed if clearly framed as illustration, not as a patch. The skill does not produce edits to auth code.
- **Every file reference is a clickable link.** No bare `file:line` text. Write `[src/lib/auth-helpers.ts:8](src/lib/auth-helpers.ts#L8)` — display is the human-readable `path:line`; href uses `#L<line>` so the link works in VS Code's preview and on GitHub. (`path:line` in the href is a Claude Code chat-only convention; it breaks in saved markdown. See SKILL.md "Link every file reference".)
- **If the model self-report (SKILL.md Phase 0) triggers the disclaimer condition**, prepend the disclaimer as a blockquote at the top of the Summary section.

If you are running **without a human to answer the interview**, stop after *Findings* and *Judgment calls for you*: emit those, skip *Prioritized backlog* and the likelihood/cost ranking, and state plainly that prioritization needs the maintainer's input.

---

# Authentication Calcification Audit — `<repo / scope>`

**Date:** `<meta.date>`
**Vendor profile(s) used:** `<per vendors[]: profile + profile_verified date>`
**Model used (self-reported):** `<meta.model_self_reported>`
**Mode:** `<meta.mode>`
**Skill version:** `<meta.skill_version>`
**Machine-readable record:** `<link to the audit JSON, e.g. [auth-calcification-audit.json](auth-calcification-audit.json)>`

## Summary

2–4 sentences. Which vendor(s) were detected, the overall posture (is there a real boundary or not), and the one or two things that matter most. No score-mongering; plain language.

(If the model disclaimer applies per SKILL.md Phase 0, prepend it as a blockquote above this paragraph.)

## What auth calcification means (for this codebase)

Two to four sentences. **First** define calcification plainly. **Then** tailor the second part to where this specific codebase actually sits, based on the findings — do not paste a generic blurb.

*Pattern to follow:* Auth calcification is the degree to which a change that should be local — swap token storage, change refresh, replace the identity provider, move from inline claim reads to a real authorization model — has instead become a cross-cutting rewrite because the vendor's types and behaviors leaked everywhere. Then state where this codebase sits. Examples (pick the closest shape; write in your own words):

- *Heavily calcified:* "Your codebase is calcified across all four axes — the vendor's session shape is the return type in five app-layer files, claim names are read inline in three components, and there's no boundary module localizing change. Any of the four future changes below would touch dozens of call sites today."
- *Well-bounded:* "Your codebase is well-bounded — an `AuthPort` interface, vendor types confined to a single adapter, a contract suite that tests the boundary itself. Any of the four future changes below stays local to one or two files."
- *Mid-migration:* "Your codebase is in transition — the new path through `<module>` is bounded; the legacy path still leaks vendor types throughout. The boundary works where it has been applied; the open work is finishing the migration."

## Coverage

What was analyzed and how — so "no finding" never reads as "clean."

- **Comprehensively read** (every relevant region opened): `<paths>` — typically the boundary/adapter modules, configuration files, and any file the profile names as load-bearing.
- **Sampled via grep + confirm** (candidates confirmed; the file as a whole not exhaustively scanned): `<paths / globs>` — typical for sweeps across many similar files (components, pages, services). Counts reported from these areas are confirmed grep hits, not exhaustive reads — qualify findings accordingly.
- **Not analyzed or low-confidence:** `<unparseable files, dynamic imports, generated code, languages without a profile, vendor detected with no profile>` — each with why.

## Boundary assessment

The structural finding that frames everything else. For each of the four boundary signals, state present / partial / absent with evidence:
- **Anti-corruption layer** — `<finding + file:line evidence>`
- **Injected vs imported** — `<finding + evidence>`
- **Contract-tested** — `<finding + evidence>`
- **Client/server split absorbed** — `<finding + evidence>`

A weak boundary is the reason the axes below are expensive; say so here.

## Findings by axis

For each axis (split per vendor where `per_vendor` differs): the observation, the evidence, and the recommended seam (in prose; ≤5-line illustrative snippets only if clearly framed as illustration). **Cost evidence** (`axes.<axis>.cost_evidence`: qualitative level + mechanical basis) is the skill's own and appears for every axis, every run. **Likelihood** is the maintainer's: state it only when the interview supplied it (`likelihood` non-null), labeled as their input; otherwise route the axis to *Judgment calls*. A maintainer-confirmed cost (`cost_confirmed`, answers-file runs only) is labeled as theirs. **Never time-based.**

### Token storage
- **Observation:** `<inherited default / custom adapter / built-in selector — name the version (e.g., v5 cookieStorage selector vs v6 setKeyValueStorage)>`
- **Evidence:** `<linked file:line — e.g. [src/config/amplify.ts:119](src/config/amplify.ts#L119)>`
- **Recommended seam:** `<the bounded shape from the methodology>`
- **Cost evidence:** `<level — mechanical basis, from cost_evidence>`
- **Likelihood:** `<maintainer's, only if supplied; otherwise "see Judgment calls">`

### Refresh and owned runtime behaviors
- **Observation:** `<inherited / owned; sibling behaviors>`
- **Evidence:** `<…>`
- **Recommended seam:** `<…>`
- **Cost evidence:** `<…>`
- **Likelihood:** `<…>`

### Identity provider
- **Observation:** `<scattered vendor-specific usage / localized>`
- **Evidence:** `<…>`
- **Recommended seam:** `<…>`
- **Cost evidence:** `<…>`
- **Likelihood:** `<…>`

### Authorization (and token type)
- **Observation:** `<inline claim/role reads; ID vs access token for API>`
- **Evidence:** `<…>`
- **Recommended seam:** `<…>`
- **Cost evidence:** `<…>`
- **Likelihood:** `<…>`

## Migration-readiness

The same findings read forward, when the maintainer indicated a change they care about (`migration_readiness` in the JSON). Per relevant axis: how far along they already are — `progress` is qualitative (**minimal / partial / substantial / nearly complete**), a boundary-completeness shorthand, never time-to-completion — and the remaining work, the specific missing pieces from `remaining`. Skip axes where no change was flagged; omit the whole section (with a one-line "not applicable, because…") when `migration_readiness` is null.

## Prioritized backlog

Ordered by leverage, using the maintainer's likelihood × your qualitative cost evidence. The order here is exactly the JSON `backlog` array order — array position is the rank. Each task:
- **Task:** `<introduce the boundary / write the adapter / add the contract suite / own refresh / localize claims / move to access tokens>`
- **Why it ranks here:** `<traceable to: mechanical evidence × the maintainer's likelihood/cost — qualitative cost only>`
- **Scope:** `<what it touches structurally — file paths and the type of change. Do NOT estimate hours or weeks; the maintainer owns that.>`

This is a backlog, not a patch. Recommend seams; do not edit auth code.

## Judgment calls for you

The questions the audit deliberately did not answer, because only the maintainer can. List each open axis and the specific question (likelihood of change, true retrofit cost in time and bandwidth, org/ownership state, backend contract dependencies). **Every axis with a null likelihood appears here individually** — in non-interactive runs, all four interview questions route here — plus the non-axis questions (`axis: null` in the JSON: unprofiled vendors, migration intent, true retrofit cost).

## Scope and disclaimers

- This is **calcification analysis, not a security audit.** It assesses changeability, not vulnerabilities. `<If the bounded storage-liability flag fired, state it here and still say: get a real security review for everything else.>`
- App↔auth boundary only; infrastructure, gateways, and IaC were out of scope.
- Findings are evidence-backed observations; the prioritization reflects the maintainer's stated inputs, shown above.
- **Cost figures are qualitative (low/moderate/high) and based on mechanical evidence.** Real time-to-complete depends on test coverage, team bandwidth, and the per-app call-site reality you know best — confirm before committing to sequencing.
