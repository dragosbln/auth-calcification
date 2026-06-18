# Calcification Audit Report — Template

Fill this exactly. Every section is load-bearing for honesty: the coverage section prevents a false all-clear, the evidence makes findings checkable, the "judgment calls" section keeps the human axes from being faked, and the disclaimers bound what was and wasn't assessed. Omit a section only if you replace it with an explicit "not applicable, because…".

If you are running **without a human to answer the interview**, stop after *Findings* and *Judgment calls for you*: emit those, skip *Prioritized backlog* and the likelihood/cost ranking, and state plainly that prioritization needs the maintainer's input.

---

# Authentication Calcification Audit — `<repo / scope>`

## Summary
2–4 sentences. Which vendor(s) were detected, the overall posture (is there a real boundary or not), and the one or two things that matter most. No score-mongering; plain language.

## Coverage
What was analyzed and what wasn't — so "no finding" never reads as "clean."
- Vendor profile(s) used: `<names + the version each was verified against>`.
- Analyzed: `<paths / globs>`.
- Not analyzed or low-confidence: `<unparseable files, dynamic imports, generated code, languages without a profile, vendor detected with no profile>` — each with why.

## Boundary assessment
The structural finding that frames everything else. For each of the four boundary signals, state present / partial / absent with evidence:
- **Anti-corruption layer** — `<finding + file:line evidence>`
- **Injected vs imported** — `<finding + evidence>`
- **Contract-tested** — `<finding + evidence>`
- **Client/server split absorbed** — `<finding + evidence>`

A weak boundary is the reason the axes below are expensive; say so here.

## Findings by axis
For each axis: the observation, the evidence, and the recommended seam. State likelihood and cost **only** if the human supplied them in the interview, and label them as the human's input. Otherwise leave them for the *Judgment calls* section.

### Token storage
- **Observation:** `<inherited default / custom adapter / built-in selector>`
- **Evidence:** `<file:line …>`
- **Recommended seam:** `<the bounded shape from the methodology>`
- **Likelihood × cost:** `<only if provided by the maintainer; otherwise "see Judgment calls">`

### Refresh and owned runtime behaviors
- **Observation:** `<inherited / owned; sibling behaviors>`
- **Evidence:** `<…>`
- **Recommended seam:** `<…>`
- **Likelihood × cost:** `<…>`

### Identity provider
- **Observation:** `<scattered vendor-specific usage / localized>`
- **Evidence:** `<…>`
- **Recommended seam:** `<…>`
- **Likelihood × cost:** `<…>`

### Authorization (and token type)
- **Observation:** `<inline claim/role reads; ID vs access token for API>`
- **Evidence:** `<…>`
- **Recommended seam:** `<…>`
- **Likelihood × cost:** `<…>`

## Migration-readiness
The same findings read forward, when the maintainer indicated a change they care about. Per relevant axis: how far along they already are and the remaining work — "you're ~X% toward `<change>`; what's left is `<the specific call sites / missing pieces>`." Skip axes where no change was flagged.

## Prioritized backlog
Ordered by leverage, using the maintainer's likelihood × cost. Each task:
- **Task:** `<introduce the boundary / write the adapter / add the contract suite / own refresh / localize claims / move to access tokens>`
- **Why it ranks here:** `<traceable to: mechanical evidence × the maintainer's likelihood/cost>`
- **Scope:** `<roughly what it touches — for a human or a supervised agent to execute>`

This is a backlog, not a patch. Recommend seams; do not edit auth code.

## Judgment calls for you
The questions the audit deliberately did not answer, because only the maintainer can. List each open axis and the specific question (likelihood of change, true retrofit cost, org/ownership state). If the interview was skipped, this section carries all the likelihood/cost questions.

## Scope and disclaimers
- This is **calcification analysis, not a security audit.** It assesses changeability, not vulnerabilities. `<If the bounded storage-liability flag fired, state it here and still say: get a real security review for everything else.>`
- App↔auth boundary only; infrastructure, gateways, and IaC were out of scope.
- Findings are evidence-backed observations; the prioritization reflects the maintainer's stated inputs, shown above.
