# Claude Code instructions for this repo

Read **`HANDOFF.md`** first. It tells you where the build is and what to do next.

Then read **`BUILD-PLAN.md`** before writing any code.

## The four non-negotiables (these are the product)

1. **Never fabricate the human axes.** Likelihood-of-change and cost-to-retrofit come from the maintainer, not from you. Without a human in the loop → emit findings + open questions, stop short of any priority ranking.
2. **Never produce a false all-clear.** Report what you analyzed and what you couldn't.
3. **Report and propose; do not rewrite.** The skill never edits auth code, only produces a backlog with recommended seams.
4. **This is calcification analysis, not a security audit.** Assess changeability, not vulnerabilities.

If any task seems to require breaking one of these, stop and surface it.

## Repo orientation

- `methodology.md` — the IP. Source of truth for what every signal means.
- `BUILD-PLAN.md` — phased execution plan with done-when checks and failure modes.
- `HANDOFF.md` — current state of the build, decisions already made, what to do next.
- `skill/auth-calcification-audit/` — the installable skill (SKILL.md + references/ + vendors/ + assets/).
- `fixtures/` — synthetic test apps; per-fixture READMEs explain expectations.
- `docs/source-brief.md` — original owner brief; voice reference for the eventual article.

## Hard invariant

`SKILL.md` and `references/detection-playbook.md` are **vendor-agnostic**. All vendor-specific knowledge lives in `vendors/*.md`. Adding a new identity provider = one new profile file, nothing else. If you find yourself wanting to name a specific vendor in the core, that knowledge belongs in a profile.
