/**
 * Layer 4 — CROSS-FORMAT AGREEMENT (build-plan step 7).
 *
 * The markdown artifacts are rendered views of the audit JSON; the contract
 * (decisions.md D3) is "the markdown may say MORE than the JSON, never
 * DIFFERENT." This layer checks the claim register of both views against the
 * JSON — it is what gives the JSON assertions jurisdiction over what humans
 * actually read.
 *
 * Deterministic checks only (the subjective remainder — headline quality,
 * synthesis-not-inventory — is the future judge layer):
 *
 *   A1 anchors    — every line-anchored link in either view resolves to an
 *                   evidence anchor in the JSON; link display and href name
 *                   the same file (and line, when the display carries one);
 *                   no bare unlinked path:line text.
 *   A2 metadata   — the report metadata block and the summary intro state
 *                   the JSON's date, mode, model, and skill version.
 *   A3 disclaimer — the Phase 0 disclaimer appears in both views iff
 *                   meta.disclaimer_fired.
 *   A4 scorecard  — each summary scorecard row contains recognizable tokens
 *                   for every per-vendor enum verdict in the JSON (boundary
 *                   row is checked against b1 — the row is a synthesis of
 *                   four signals and b1 is its anchor signal).
 *   A5 ranking    — backlog null ⇔ "Top open questions" (no ranked moves);
 *                   backlog present ⇔ "Top moves".
 *   A6 posture    — synthesis.posture appears verbatim (normalized) in the
 *                   summary.
 */
import { AXES } from "./types.ts";
import type { AuditDoc } from "./types.ts";

export interface AgreementResult {
  errors: string[];
  warnings: string[];
}

interface Link {
  display: string;
  href: string;
}

const LINK_RX = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function extractLinks(md: string): Link[] {
  return [...md.matchAll(LINK_RX)].map((m) => ({ display: m[1], href: m[2] }));
}

function stripLinks(md: string): string {
  return md.replace(LINK_RX, " ");
}

/** lowercase, strip emphasis/backticks/apostrophes, hyphens & underscores→spaces, collapse whitespace */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[`*']/g, "").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

/** content words (length > 2) of a string, as a set */
function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((t) => t.length > 2));
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

/** the text of the first numbered item under the summary's "Top moves" heading */
function firstTopMove(summaryMd: string): string | null {
  const lines = summaryMd.split("\n");
  const start = lines.findIndex((l) => /top moves/i.test(l));
  if (start < 0) return null;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s*1[.)]\s+(.*)/);
    if (m) return m[1];
  }
  return null;
}

function evidenceAnchorSet(doc: AuditDoc): Set<string> {
  const set = new Set<string>();
  for (const f of doc.findings) {
    for (const ev of [...(f.evidence ?? []), ...(f.context_evidence ?? [])]) {
      set.add(`${ev.file}#${ev.line}`);
    }
  }
  return set;
}

const cleanPath = (p: string): string => p.replace(/^\.\//, "");

export function checkAgreement(doc: AuditDoc, reportMd: string, summaryMd: string): AgreementResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (msg: string) => void errors.push(msg);

  const anchors = evidenceAnchorSet(doc);

  // --- A1: anchors ---
  for (const [name, md] of [["report", reportMd], ["summary", summaryMd]] as const) {
    // range citations render as link pairs — "[file:79](f#L79)–[:83](f#L83)".
    // The end link bounds the same claim as the (backed) start; it is not an
    // independent anchor. Collect backed-start range ends and exempt them.
    const rangeEnds = new Set<string>();
    for (const m of md.matchAll(/\]\(([^)\s]+)#L(\d+)\)\s*[–—-]\s*\[:(\d+)\]\(([^)\s]+)#L(\d+)\)/g)) {
      const [, startFile, startLine, endDisplay, endFile, endLine] = m;
      if (cleanPath(startFile) === cleanPath(endFile) && endDisplay === endLine && anchors.has(`${cleanPath(startFile)}#${startLine}`)) {
        rangeEnds.add(`${cleanPath(endFile)}#${endLine}`);
      }
    }
    for (const { display, href } of extractLinks(md)) {
      if (/^https?:/.test(href)) continue;
      const hrefLine = href.match(/^([^#]+)#L(\d+)$/);
      if (!hrefLine) continue; // whole-file / dir / sibling-artifact links carry no line claim
      const hrefFile = cleanPath(hrefLine[1]);
      const line = hrefLine[2];

      // JOB 1 (always first, never short-circuited): a line-anchored link is a
      // claim, so the anchor must be backed by a JSON evidence line. This is
      // the honesty property — it catches a mis-anchored link regardless of how
      // the display text reads.
      if (!anchors.has(`${hrefFile}#${line}`) && !rangeEnds.has(`${hrefFile}#${line}`)) {
        err(`A1 ${name}: anchor ${hrefFile}:${line} is not backed by any evidence anchor in the JSON`);
      }

      // JOB 2 (only when the DISPLAY is itself a path:line): a good renderer
      // links a symbol (`ISessionRepository`), a code snippet, or a phrase
      // ("boundary") to a location — that display is NOT a path and must not be
      // forced to match the href. Only when the display spells out a path:line
      // must it agree with the href: same line, and the display file a suffix of
      // the href file (basename abbreviation like `foo.ts:11` for a/b/foo.ts).
      const dRange = display.match(/^`?(.+?):(\d+)\s*[–—-]\s*\d+`?$/);
      const dPathLine = dRange ?? display.match(/^`?([\w./-]+\.\w+):(\d+)`?$/);
      const dLineOnly = display.match(/^`?:(\d+)`?$/);
      if (dPathLine) {
        const df = cleanPath(dPathLine[1]);
        if (dPathLine[2] !== line) {
          err(`A1 ${name}: link display line ${dPathLine[2]} != href line ${line} ('${display}')`);
        } else if (hrefFile !== df && !hrefFile.endsWith("/" + df)) {
          err(`A1 ${name}: link display path '${df}' contradicts href file '${hrefFile}'`);
        }
      } else if (dLineOnly && dLineOnly[1] !== line) {
        err(`A1 ${name}: link display line ${dLineOnly[1]} != href line ${line} ('${display}')`);
      }
    }
    // bare path:line outside links
    for (const m of stripLinks(md).matchAll(/(?<![[\w/])[\w./-]+\.(?:tsx?|jsx?|mjs|cjs|json):\d+\b/g)) {
      err(`A1 ${name}: bare unlinked path:line '${m[0]}' (every claim anchor must be a clickable link)`);
    }
  }

  // --- A2: metadata ---
  const metaLine = (label: string): string | null =>
    reportMd.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)$`, "m"))?.[1] ?? null;
  const expectLine = (label: string, value: string) => {
    const got = metaLine(label);
    if (got === null) err(`A2 report: metadata line '**${label}:**' missing`);
    else if (!got.includes(value)) err(`A2 report: '${label}' line says '${got.trim()}', JSON says '${value}'`);
  };
  expectLine("Date", doc.meta.date);
  expectLine("Mode", doc.meta.mode);
  expectLine("Model used \\(self-reported\\)", doc.meta.model_self_reported);
  expectLine("Skill version", doc.meta.skill_version);
  for (const v of doc.vendors) {
    if (v.profile && !reportMd.includes(v.profile)) {
      err(`A2 report: vendor profile '${v.profile}' not named in the report`);
    }
  }
  // tolerate a view stating the model without a parenthetical id suffix
  const modelShort = doc.meta.model_self_reported.replace(/\s*\(.*\)$/, "");
  if (!summaryMd.includes(doc.meta.model_self_reported) && !summaryMd.includes(modelShort)) {
    err(`A2 summary: model '${doc.meta.model_self_reported}' not stated`);
  }
  if (!summaryMd.includes(doc.meta.mode)) {
    err(`A2 summary: mode '${doc.meta.mode}' not stated`);
  }

  // --- A3: disclaimer ---
  for (const [name, md] of [["report", reportMd], ["summary", summaryMd]] as const) {
    const has = /model disclaimer/i.test(md);
    if (doc.meta.disclaimer_fired && !has) err(`A3 ${name}: disclaimer_fired is true but no model disclaimer rendered`);
    if (!doc.meta.disclaimer_fired && has) err(`A3 ${name}: model disclaimer rendered but disclaimer_fired is false`);
  }

  // --- A4: scorecard tokens ---
  const TOKENS: Record<string, string[]> = {
    // boundary / signal statuses
    present: ["present"], partial: ["partial"], absent: ["absent"],
    not_applicable: ["not applicable", "n/a"], undetermined: ["undetermined"],
    // storage
    vendor_default: ["default"], builtin_selector: ["selector", "built in"], custom_adapter: ["custom"],
    // refresh
    inherited: ["inherited"], owned: ["owned"],
    // identity provider
    localized: ["localized"], scattered: ["scattered"],
    // authorization
    inline_reads: ["inline"], policy_layer: ["policy"],
    principal_without_policy: ["without policy", "no policy", "without a policy"],
    id_token: ["id token"], access_token: ["access token"], opaque: ["opaque"],
    other: [],
  };
  const rows = new Map<string, string>();
  for (const line of summaryMd.split("\n")) {
    if (!line.trimStart().startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 2) rows.set(normalize(cells[0]), normalize(cells.slice(1).join(" ")));
  }
  const requireTokens = (rowName: string, value: string, context: string) => {
    const row = rows.get(rowName);
    if (row === undefined) {
      err(`A4 summary: scorecard row '${rowName}' missing`);
      return;
    }
    const tokens = TOKENS[value] ?? [];
    if (tokens.length && !tokens.some((t) => row.includes(t))) {
      err(`A4 summary: '${rowName}' row does not reflect ${context} = '${value}' (expected one of: ${tokens.join(" / ")})`);
    }
  };
  const profiled = doc.vendors.filter((v) => v.profile !== null);
  for (const v of profiled) {
    const b1 = doc.boundary[v.id]?.b1_anti_corruption.status;
    if (b1) requireTokens("boundary", b1, `${v.id} b1 status`);
    const axisRow: Record<(typeof AXES)[number], string> = {
      storage: "storage", refresh: "refresh", identity_provider: "provider", authorization: "authorization",
    };
    for (const axis of AXES) {
      const pv = doc.axes[axis].per_vendor[v.id];
      if (!pv) continue;
      if (pv.classification) requireTokens(axisRow[axis], pv.classification, `${v.id} ${axis}`);
      if (pv.claims_handling) requireTokens("authorization", pv.claims_handling, `${v.id} claims_handling`);
      if (pv.api_token_type && pv.api_token_type !== "not_applicable") {
        requireTokens("authorization", pv.api_token_type, `${v.id} api_token_type`);
      }
    }
  }

  // --- A5: ranking shape ---
  const nSummary = normalize(summaryMd);
  if (doc.backlog === null && !nSummary.includes("top open questions")) {
    err("A5 summary: backlog is null but 'Top open questions' section missing (non-interactive shape)");
  }
  if (doc.backlog !== null && !nSummary.includes("top moves")) {
    err("A5 summary: backlog present but 'Top moves' section missing");
  }

  // --- A7: a ranked backlog must surface in the views ---
  if (doc.backlog && doc.backlog.length) {
    // The report enumerates the full backlog verbosely, so token-containment is
    // the right tool there: every task must be reflected.
    const nReport = normalize(reportMd);
    doc.backlog.forEach((item, i) => {
      const tokens = normalize(item.task).split(" ").filter((t) => t.length > 2);
      const hit = tokens.filter((t) => nReport.includes(t)).length;
      if (tokens.length && hit / tokens.length < 0.7) {
        err(`A7 report: backlog[${i}] task '${item.task}' not reflected (${hit}/${tokens.length} tokens)`);
      }
    });
    // The summary COMPRESSES — a good "Top moves #1" is a headline, not the full
    // task text — so absolute containment is the wrong tool (it punishes good
    // compression). Verify the real property instead: the summary's lead move
    // corresponds to backlog #1 more than to any other task (nearest-match).
    // This is robust to how aggressively the headline is trimmed and still
    // catches a genuinely reordered/replaced lead. (Whether the headline is
    // well-written is a judge-layer question, out of scope here.)
    const lead = firstTopMove(summaryMd);
    if (lead === null) {
      err("A7 summary: backlog is present but no numbered 'Top moves' item was found");
    } else {
      const leadTokens = tokenSet(lead);
      const scores = doc.backlog.map((b) => overlapCount(leadTokens, tokenSet(b.task)));
      const bestScore = Math.max(...scores);
      const best = scores.indexOf(bestScore);
      if (bestScore === 0) {
        err(`A7 summary: lead Top move shares no content with any backlog task ('${lead.slice(0, 60)}…')`);
      } else if (best !== 0) {
        err(
          `A7 summary: lead Top move matches backlog #${best + 1}, not the #1-ranked task ` +
            `('${doc.backlog[0].task.slice(0, 50)}…')`,
        );
      }
    }
  }

  // --- A6: posture ---
  // renderers smooth grammar ("vendor shape" → "the vendor's shape"), so exact
  // substring is a guess that real data refuted (D24). Token containment: the
  // posture's substantive words must appear in the summary.
  const postureTokens = normalize(doc.synthesis.posture).split(" ").filter((t) => t.length > 2);
  const hit = postureTokens.filter((t) => nSummary.includes(t)).length;
  if (postureTokens.length > 0 && hit / postureTokens.length < 0.8) {
    err(
      `A6 summary: synthesis.posture '${doc.synthesis.posture}' not reflected ` +
        `(${hit}/${postureTokens.length} tokens found)`,
    );
  }

  return { errors, warnings };
}
