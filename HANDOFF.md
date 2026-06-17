# HANDOFF — Auth Calcification Audit Skill

This repo was scaffolded in a chat session. You're picking up partway through the build. Read this file first, then `BUILD-PLAN.md`.

## Where the build is right now

Phases complete:
- **Phase A (scaffolding)** — done. All skill files drafted.
- **Phase B (verify Cognito profile)** — done. `vendors/amplify-cognito.md` Verification line stamped 2026-06-17.
- **Phase C (read orchestration)** — done; no edits needed.
- **Phase D (verify Auth0 profile)** — done. `vendors/auth0.md` Verification line stamped 2026-06-17.

Phase in progress:
- **Phase E (build fixtures)** — partially done for `calcified-cognito` only:
  - `package.json`, `README.md`, `src/lib/amplify-config.ts`, `src/lib/auth-helpers.ts`, `src/api/client.ts` exist.
  - **Still to build** in `calcified-cognito`: `src/components/UserBadge.tsx`, `src/components/AdminPanel.tsx`, `src/pages/Profile.tsx`, `__tests__/auth.test.ts` (its README lists what each should demonstrate).
  - **Still to build entirely**: `bounded-cognito/` and `bounded-auth0/` (specs in `BUILD-PLAN.md` Phase E).

Phases remaining:
- **F** — Dry-compose a report against `bounded-cognito` to confirm the template covers everything.
- **G** — The test loop. See "Test loop in Claude Code" below.

## Decisions already made — do not relitigate

These were settled during the chat and are baked into the docs. If something here surprises you, the reasoning is in `methodology.md` or the relevant skill file, not in this handoff:

- **The boundary is an enabler, not a fifth axis.** Boundary quality feeds cost on every axis.
- **Axis 4 is Authorization**, with the old "token type (ID vs access)" folded in as a sub-concern alongside claim/role coupling.
- **Axis 2 is "Refresh and other owned runtime behaviors."** Refresh is the lead example, not the whole axis; sign-out propagation, multi-tab sync, and silent re-auth ride along.
- **Two honesty rules govern the method**: coverage/confidence reporting (no false all-clear), and report-not-rewrite (the skill never edits auth code).
- **Migration-readiness** is risk read in reverse — same scoring, different framing.
- **Cognito is the base; Auth0 is the portability proof.** The skill must work for both, but the article will frame Auth0 as a demonstration that the methodology travels, not as a co-headliner.
- **Vendor portability is structural.** `SKILL.md` and `detection-playbook.md` never name a specific vendor; all vendor knowledge lives in `vendors/*.md`. Adding a provider = adding one file. Do not break this invariant.
- **Deliberately deferred** (do NOT build in v1): a guided "add a provider" sub-skill, the ESLint plugin, a CI drift baseline, broader vendor coverage (Firebase, NextAuth, Better Auth), the conditional session/identity-model axis as a scored item, and the bounded storage-as-current-liability security flag.

## The four non-negotiables (repeated because they are the product)

1. **Never fabricate the human axes.** Likelihood-of-change and cost-to-retrofit come from the maintainer. No human in the loop → emit findings + open questions, stop short of any priority ranking.
2. **Never produce a false all-clear.** Report what you analyzed and what you couldn't. "No finding" means "looked and found nothing."
3. **Report and propose; do not rewrite.** Output a prioritized backlog with recommended seams. Do not edit auth code.
4. **This is calcification analysis, not a security audit.** Assess changeability, not vulnerabilities. Say so in the report.

If any task seems to require breaking one of these, stop and surface it.

## Test loop in Claude Code (differs from the plan's claude.ai assumption)

`BUILD-PLAN.md` §4 assumes a claude.ai environment with no subagents. In Claude Code you can spawn parallel sub-agents. Use them if useful (e.g., one agent runs the audit on each fixture in parallel and you compare outputs), but two things hold either way:

- Per-fixture expected behavior is unchanged: `calcified-cognito` should trip everything; both bounded fixtures should come back near-clean with high migration-readiness; `bounded-auth0` and `bounded-cognito` should produce structurally similar reports (proving portability).
- The honesty rules are the bar, not the mechanism. A subagent that fabricates likelihood/cost fails the test the same as the main agent doing it.

## What to do next

1. Read `BUILD-PLAN.md` end to end (it's ~140 lines).
2. Skim each skill file once so you're oriented.
3. Finish Phase E:
   - Complete `fixtures/calcified-cognito/` from its README's file list.
   - Build `fixtures/bounded-cognito/` per the plan's spec.
   - Build `fixtures/bounded-auth0/` — same `AuthPort` and app code as `bounded-cognito`, with an Auth0 adapter swapped in. This is the portability proof; if it requires more than swapping one adapter file, the boundary isn't really a boundary.
4. Phase F: hand-write a report against `bounded-cognito` using the template; fix the template only if a section is missing or unclear.
5. Phase G: run the audit on each fixture, save outputs to `fixtures/<name>/_audit-output.md`, review with the owner, refine the skill (usually the playbook or a profile — not `SKILL.md`).
6. Stop at Definition of Done (BUILD-PLAN.md §7) and check in with the owner before any post-v1 work.

## Things to deliberately not do

- Don't add a vendor name to `SKILL.md` or `detection-playbook.md`. Vendor knowledge belongs in profiles.
- Don't copy real/proprietary code into the fixtures. They are synthetic.
- Don't auto-edit any auth code in any audit run. Even if the user asks.
- Don't write the article yet. It's downstream of a working skill; jot down decisions as you build, but the article is post-v1.
- Don't extend the audit into vulnerability scanning beyond the one tightly-bounded storage-liability flag, which is itself deferred. The "not a security audit" line must hold.

## Source materials in this repo

- `methodology.md` — the IP. Source of truth for what every signal means.
- `docs/source-brief.md` — the owner's original brief that informed the methodology. Voice reference for the eventual article; not a spec.
- `BUILD-PLAN.md` — execution plan with phases, "done when" checks, failure modes.
- `skill/auth-calcification-audit/` — the installable skill.
- `fixtures/` — synthetic test apps (per-fixture READMEs explain what each should demonstrate).
