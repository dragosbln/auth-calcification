# Auth Calcification Audit

> **Assess how tightly your authentication is wired to vendor defaults — before a future change becomes expensive.**

An agentic skill for Claude Code that audits the seam between your application and its identity provider (Cognito, Auth0, or others) for **calcification risk**: the degree to which changes that should be local — swap token storage, change refresh, replace the IdP, move to a real authorization model — have instead become cross-cutting rewrites.

## When to use this

- You're about to make an expensive-to-reverse auth decision and want an independent audit first
- A security review flagged your auth (e.g., tokens in localStorage, ID tokens for API auth) and you need to scope the fix
- Your team is mid-migration (Auth0 → Cognito, vendor A → vendor B) and you want to know how far you've come
- You inherited a codebase and want to understand whether the auth boundary is real or leaky

## What it finds (with evidence)

The skill produces a **report with file:line evidence** across four axes:

1. **Token storage** — inherited default (localStorage) vs. custom adapter (swappable)
2. **Ownership of runtime behaviors** — leading with refresh token - vendor magic vs. owned 401-handling with single-flight + failure path; Extends to sign-out propagation, multi-tab session sync, silent re-auth, etc
3. **Identity provider coupling** — vendor-specific features scattered vs. localized to one adapter
4. **Authorization** — inline claim reads + hard-coded roles vs. domain policy layer; ID token vs. access token for API

Plus four **boundary signals** that determine cost on every axis above: anti-corruption layer, injection vs. import, contract tests, client/server split absorption.

**What makes it trustworthy:**
- **Mechanical detection** (grep + confirm) — no guesswork
- **Escalates judgment** — never fabricates likelihood or cost; routes those to "Judgment calls for you"
- **No false all-clear** — coverage section reports what was analyzed and what wasn't
- **Vendor-agnostic** — works across providers via pluggable profiles (Cognito + Auth0 included; Firebase/NextAuth/Better Auth deferred to v2)

See [`methodology.md`](methodology.md) for the full framework.

## Installation

### Via GitHub

```bash
# Add this repo as a marketplace:
/plugin marketplace add YOUR-USERNAME/auth-calcification

# Install the skill:
/plugin install auth-calcification-audit@YOUR-USERNAME
```

### Local development

```bash
git clone https://github.com/YOUR-USERNAME/auth-calcification.git
cd auth-calcification
claude --plugin-dir ./skill/auth-calcification-audit
```

## Usage

### Basic usage (interactive, default)

```bash
# In Claude Code session, from your project root:
/auth-calcification-audit
```

The skill will run interactively by default — after the mechanical pass, it will ask you questions about likelihood-of-change and cost-to-retrofit to enable prioritization.

### Non-interactive mode

Skip the interview and get straight to findings:

```bash
/auth-calcification-audit --interactive=false
```

Use this for CI runs, batch audits, or when you want findings without being prompted.

### What the skill does

1. **Detect vendors** (reads `package.json`, loads matching profiles)
2. **Run mechanical pass** (locate → confirm for each signal)
3. **Interview** (if `--interactive=true`, default) — asks likelihood/cost questions
4. **Produce full report** (markdown, saved to `_audit-output.md` or displayed inline)

**Output:** A report with Summary, Coverage (what was/wasn't assessed), Boundary Assessment (4 signals), Findings by Axis (4 axes with evidence), Judgment Calls (questions only you can answer), and optionally a Prioritized Backlog (if you ran interactively and answered the questions).

### Example output

See worked examples:
- [`fixtures/calcified-cognito/_audit-output.md`](fixtures/calcified-cognito/_audit-output.md) — the "before" (everything calcified)
- [`fixtures/bounded-cognito/_audit-output.md`](fixtures/bounded-cognito/_audit-output.md) — the "after" (well-bounded)
- [`fixtures/mixed-edge-cases/_audit-output.md`](fixtures/mixed-edge-cases/_audit-output.md) — real-world complexity (multi-vendor, mid-migration)

## Supported vendors

**v1 (included):**
- AWS Amplify v6 / Amazon Cognito
- Auth0 SPA SDK v2

**Deferred to v2:**
- Firebase Auth
- NextAuth.js / Auth.js
- Better Auth
- Clerk

Adding a vendor = writing one profile file (`vendors/<vendor>.md`) following [`references/vendor-profile-schema.md`](skill/auth-calcification-audit/references/vendor-profile-schema.md). PRs welcome.

## The four non-negotiables

What makes this skill safe to trust:

1. **Never fabricate the human axes.** Likelihood-of-change and cost-to-retrofit come from you, not the model. No human in the loop → findings + questions, no priority ranking.
2. **Never produce a false all-clear.** Coverage section reports what was analyzed and what wasn't. "No finding" means "looked and found nothing," never "didn't look."
3. **Report and propose; do not rewrite.** Outputs a prioritized backlog with recommended seams. Does not edit your auth code.
4. **This is calcification analysis, not a security audit.** Assesses changeability, not vulnerabilities.

## How it works (30-second version)

1. Reads your `package.json` to detect auth vendors (e.g., `aws-amplify`, `@auth0/auth0-spa-js`)
2. Loads matching **vendor profiles** (`vendors/amplify-cognito.md`, `vendors/auth0.md`) with SDK-specific identifiers
3. Follows the **detection playbook** (`references/detection-playbook.md`): for each signal, **locate** candidates (grep/file reads), then **confirm** by reading surrounding code
4. Fills the **report template** (`assets/report-template.md`) with findings + evidence
5. Routes everything it can't mechanically determine to **"Judgment calls for you"**

The IP is the **methodology** (`methodology.md`), not the orchestration. The skill is the operationalization.

## Contributing

**To add a vendor profile:**
1. Read [`skill/auth-calcification-audit/references/vendor-profile-schema.md`](skill/auth-calcification-audit/references/vendor-profile-schema.md)
2. Write `skill/auth-calcification-audit/vendors/<vendor>.md` following the schema
3. Verify against current SDK docs (note the version in the Verification section)
4. Test on a fixture (bounded + calcified examples)
5. PR with the profile + fixture outputs

**To report issues:**
- Open an issue with the vendor, SDK version, and excerpt of unexpected output
- Include the Coverage section from the report (tells us what was analyzed)

## License

MIT — see [LICENSE](LICENSE)

## Context

This skill is part of a [series on auth architecture in production](https://dev.to/YOUR-USERNAME). The methodology was developed from real work re-architecting authentication in a 100+ microservice production system. The skill makes that methodology reproducible and vendor-agnostic.

**Articles:**
1. [Securing auth in a large-scale production system](https://dev.to/YOUR-USERNAME/part1) — three industry-standard architectures, constraint-stack analysis, and the foundation-move pattern
2. [3 ways to future-proof your authentication system](https://dev.to/YOUR-USERNAME/part2) — the boundary pattern, contract testing, owned refresh, and the agentic-era framing
3. *(Coming)* Building an agentic skill without riding the hype train — how to build AI tools that escalate judgment instead of faking it

Follow along: [LinkedIn](https://linkedin.com/in/YOUR-HANDLE)
