# Claude Code instructions for this repo

Read **`decisions.md`** first — the running log of design decisions (with rationale) for the current build thread: the testing layer. Its last entries tell you where the build is.

## The four non-negotiables (these are the product)

1. **Never fabricate the human axes.** Likelihood-of-change and cost-to-retrofit come from the maintainer, not from you. Without a human in the loop → emit findings + open questions, stop short of any priority ranking.
2. **Never produce a false all-clear.** Report what you analyzed and what you couldn't.
3. **Report and propose; do not rewrite.** The skill never edits auth code, only produces a backlog with recommended seams.
4. **This is calcification analysis, not a security audit.** Assess changeability, not vulnerabilities.

If any task seems to require breaking one of these, stop and surface it.

## Repo orientation

- `methodology.md` — the IP. Source of truth for what every signal means.
- `decisions.md` — design-decision log for the testing layer, with rationale. Newest at the bottom.
- `skill/auth-calcification-audit/` — the installable skill (SKILL.md + references/ + vendors/ + assets/).
  - `assets/audit-schema.json` — the canonical output schema (JSON is the source; both markdowns are rendered views of it).
- `fixtures/` — synthetic test apps; per-fixture READMEs explain expectations.
- `harness/` — external test tooling (never packaged with the plugin). `golden/` holds hand-authored expected JSON per fixture.

## Hard invariant

`SKILL.md` and `references/detection-playbook.md` are **vendor-agnostic**. All vendor-specific knowledge lives in `vendors/*.md`. Adding a new identity provider = one new profile file, nothing else. If you find yourself wanting to name a specific vendor in the core, that knowledge belongs in a profile.
