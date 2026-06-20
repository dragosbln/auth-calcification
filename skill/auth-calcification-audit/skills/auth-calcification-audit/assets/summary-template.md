# Calcification Audit Summary — Template

This is the **lead artifact** — the first thing the maintainer reads, the thing that gets pasted into Slack and skimmed by a skeptical senior in 60 seconds. It either earns trust or loses it. **Distill it from the full report you already wrote** (artifact 1); it must contain nothing the report doesn't, and every status, count, and `file:line` anchor must match the report exactly.

## The bar this must clear

- **One screen.** ~250–350 words. If it's longer, it's not a summary — cut to the load-bearing findings.
- **Specific in the first three lines.** Name their vendor, their version, their files. A generic opener ("your auth has some coupling") discredits instantly. Prove you read *their* code, not auth-in-general.
- **Lead with synthesis, not inventory.** The headline should prefer a *connection* — a mechanical finding × the maintainer's stated roadmap = a named tension or hidden dependency — over a bare fact, when one exists. (E.g., "you flagged RBAC, but permissions ride in the access token, which you don't send.") That synthesis is what proves the audit did architecture, not grep.
- **Honest about confidence.** The posture line carries a confidence clause tied to coverage. Never let the summary read as a clean bill of health if files were skipped or sampled.
- **No time estimates. No code. No methodology lecture.** (The reader already ran the skill.)

## Fill rules

- If Phase 0 triggered the **model disclaimer**, prepend it as a blockquote at the very top, before the title block.
- In **non-interactive mode**, replace the "Top moves" section with "Top open questions" (no ranking — there's no likelihood input to rank by) and say so in one line.
- Keep the scorecard to the 5 rows below. One status phrase + one anchor per row. Status phrases should carry nuance ("split," "built-in selector," "localized") — not a clean/dirty binary.
- **Every anchor is a clickable link**, never bare text. Format: `[src/api/client.ts:15](src/api/client.ts#L15)` — display is the human-readable `path:line`; href uses `#L<line>` so the link works in VS Code's preview and on GitHub. (`path:line` in the href is a Claude Code chat-only convention and produces broken links in saved markdown.) This applies to the scorecard Anchor column, the headline, and the "only you can decide" references. The pointer to the full report is also a link: `[auth-calcification-audit-report.md](auth-calcification-audit-report.md)`.

---

> **Model disclaimer (only if Phase 0 triggered it):** This audit was run on `<self-reported model>`. The skill is verified against Opus 4.7+ / Sonnet 4.6+; lower tiers have known recall gaps. Treat as a first pass and re-run with a higher-tier model before acting.

## Auth Calcification — Summary · `<repo / scope>`

`<Vendor + version>` `<(notable context, e.g. "federates to Okta via OIDC")>`. Run on `<model, self-reported>`, `<interactive / non-interactive>`.

**Posture: `<one phrase — e.g. well-bounded but incomplete / heavily calcified / mid-migration>`.** `<1–2 sentences: the overall structural verdict in plain language.>` *(`<confidence clause — e.g. "High confidence: boundary modules read in full; the N apps sampled via grep+confirm.">`)*

**Headline:** `<The single most consequential finding. Prefer a synthesis: a mechanical fact × the maintainer's stated roadmap = a named tension/dependency/risk. Include the evidence anchor(s). 1–3 sentences.>`

| Signal | Status | Anchor |
|---|---|---|
| Boundary | `<present / partial / absent — note the key gap, e.g. "no AuthPort, no contract suite">` | `<linked file or dir>` |
| Storage | `<inherited default / built-in selector / custom adapter — name the version if it matters>` | `<linked file:line>` |
| Refresh | `<inherited / owned / split (server owned, client inherited)>` | `<linked file:line>` |
| Provider | `<scattered / localized — coupling level>` | `<linked file:line>` |
| Authorization | `<inline reads / bounded via policy; ID-token-for-API vs access token>` | `<linked file:line>` |

*(Every Anchor cell is a markdown link, e.g. `[src/api/client.ts:15](src/api/client.ts#L15)` — not bare text.)*

**Top moves** `<(ranked by your inputs — likelihood × cost)>` *— in non-interactive mode, retitle this "Top open questions" and drop the ranking.*
1. **`<move>`** — `<one line: what + why now>`. *`<likelihood × cost, qualitative>`.*
2. **`<move>`** — `<…>`. *`<…>`.*
3. **`<move>`** — `<…>`. *`<…>`.*

**Only you can decide:** `<1–2 lines — the escalated judgment. The axes routed to "Judgment calls" because likelihood/org/cost is the maintainer's, not the code's. This section is the differentiator; keep it visible.>`

*Full evidence, per-axis findings, coverage, and migration-readiness → `<full report filename>`*
