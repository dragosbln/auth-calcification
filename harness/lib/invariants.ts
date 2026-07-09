/**
 * Layer 2 — RELATIONAL invariants.
 *
 * Everything JSON Schema cannot express: referential integrity between
 * findings and the assessments that cite them, verbatim evidence quotes
 * re-checked against the audited codebase, the non-negotiables as cross-field
 * implications, escape-hatch pairing rules, and the no-durations sweep.
 *
 * This layer assumes the document already passed layer 1 (lib/schema.ts) —
 * it reads fields without defensive existence checks on purpose. Run shape
 * validation first; that's what the layering buys.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AXES } from "./types.ts";
import type { AuditDoc, Finding } from "./types.ts";
import { LIKELIHOOD_MAPPING, loadInterviewFile } from "./interview.ts";

const DURATION_RX =
  /\b\d+(\.\d+)?\s*(-\s*\d+(\.\d+)?\s*)?(hour|hr|day|week|sprint|month|dev-week|man-day|person-day)s?\b/i;

export interface InvariantResult {
  errors: string[];
  warnings: string[];
  findings: number;
  references: number;
}

function* walkStrings(node: unknown, path = "$"): Generator<[string, string]> {
  if (typeof node === "string") {
    yield [path, node];
  } else if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* walkStrings(node[i], `${path}[${i}]`);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) yield* walkStrings(v, `${path}.${k}`);
  }
}

export function checkInvariants(doc: AuditDoc, codeRoot: string): InvariantResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (msg: string) => void errors.push(msg);
  const warn = (msg: string) => void warnings.push(msg);

  const findings = new Map<string, Finding>(doc.findings.map((f) => [f.id, f]));

  // I1: finding ids unique
  const ids = doc.findings.map((f) => f.id);
  for (const dup of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
    err(`I1 duplicate finding id: ${dup}`);
  }

  // Collect every finding_ids reference. Note (schema 1.1): which signal a
  // finding evidences is expressed ONLY by these citations — there is no
  // finding-side signals field to drift against (decisions.md D21).
  type Ref = { findingId: string; where: string };
  const refs: Ref[] = [];
  for (const [vendor, sigs] of Object.entries(doc.boundary)) {
    for (const [sig, assessment] of Object.entries(sigs)) {
      for (const fid of assessment.finding_ids) refs.push({ findingId: fid, where: `boundary.${vendor}.${sig}` });
    }
  }
  for (const axis of AXES) {
    for (const [vendor, pv] of Object.entries(doc.axes[axis].per_vendor)) {
      for (const fid of pv.finding_ids) refs.push({ findingId: fid, where: `axes.${axis}.per_vendor.${vendor}` });
    }
    for (const fid of doc.axes[axis].cost_evidence.finding_ids ?? []) {
      refs.push({ findingId: fid, where: `axes.${axis}.cost_evidence` });
    }
  }
  doc.judgment_calls.forEach((jc, i) => {
    for (const fid of jc.finding_ids ?? []) refs.push({ findingId: fid, where: `judgment_calls[${i}]` });
  });
  for (const fid of doc.synthesis.headline.finding_ids) {
    refs.push({ findingId: fid, where: "synthesis.headline" });
  }
  (doc.backlog ?? []).forEach((item, i) => {
    for (const fid of item.finding_ids) refs.push({ findingId: fid, where: `backlog[${i}]` });
  });

  // I2: every reference resolves
  for (const r of refs) {
    if (!findings.has(r.findingId)) err(`I2 unresolved finding id '${r.findingId}' at ${r.where}`);
  }

  // I3: no orphans — a finding nothing cites would never render (and is
  // therefore unclassified work)
  const referenced = new Set(refs.map((r) => r.findingId));
  for (const fid of findings.keys()) {
    if (!referenced.has(fid)) err(`I3 orphan finding never referenced by any assessment: ${fid}`);
  }

  // I4: evidence quotes verify against the codebase — presence evidence and
  // absence context anchors alike (schema >= 1.2)
  for (const f of doc.findings) {
    for (const ev of [...(f.evidence ?? []), ...(f.context_evidence ?? [])]) {
      const fp = join(codeRoot, ev.file);
      if (!existsSync(fp)) {
        err(`I4 ${f.id}: cited file does not exist: ${ev.file}`);
        continue;
      }
      const lines = readFileSync(fp, "utf8").split("\n");
      if (ev.line > lines.length) {
        err(`I4 ${f.id}: ${ev.file}:${ev.line} beyond EOF (${lines.length} lines)`);
        continue;
      }
      if (!lines[ev.line - 1].includes(ev.quote)) {
        const hits = lines.flatMap((l, i) => (l.includes(ev.quote) ? [i + 1] : []));
        err(
          `I4 ${f.id}: quote not at ${ev.file}:${ev.line}` +
            (hits.length ? ` (found at line [${hits}])` : " (found nowhere in file)"),
        );
      }
    }
  }

  // I5: vendor completeness
  const profiled = new Set(doc.vendors.filter((v) => v.profile).map((v) => v.id));
  const unprofiled = new Set(doc.vendors.filter((v) => !v.profile).map((v) => v.id));
  const gapVendors = new Set(doc.coverage.gaps.map((g) => g.vendor).filter(Boolean));
  for (const v of profiled) {
    if (!(v in doc.boundary)) err(`I5 profiled vendor '${v}' has no boundary entry`);
    for (const axis of AXES) {
      if (!(v in doc.axes[axis].per_vendor)) err(`I5 profiled vendor '${v}' missing from axes.${axis}.per_vendor`);
    }
  }
  for (const v of unprofiled) {
    if (!gapVendors.has(v)) err(`I5 unprofiled vendor '${v}' not recorded in coverage.gaps`);
    if (v in doc.boundary) err(`I5 unprofiled vendor '${v}' has a boundary assessment — must not be assessed`);
    for (const axis of AXES) {
      if (v in doc.axes[axis].per_vendor) err(`I5 unprofiled vendor '${v}' assessed on axes.${axis}`);
    }
  }
  for (const f of doc.findings) {
    if (f.vendor !== null && !profiled.has(f.vendor) && !unprofiled.has(f.vendor)) {
      err(`I5 finding ${f.id} names unknown vendor '${f.vendor}'`);
    }
  }

  // I6: non-negotiable implications
  const interview = doc.interview;
  const jcAxes = new Set(doc.judgment_calls.map((jc) => jc.axis));
  for (const axis of AXES) {
    const lik = doc.axes[axis].likelihood;
    if (interview === null && lik !== null) {
      err(`I6 axes.${axis}.likelihood is '${lik}' but interview is null (fabricated human axis)`);
    }
    if (lik !== null && (interview === null || !(axis in interview.answers))) {
      err(`I6 axes.${axis}.likelihood set without a matching interview answer`);
    }
    if (lik === null && !jcAxes.has(axis)) {
      err(`I6 axis '${axis}' has null likelihood but no judgment_calls entry`);
    }
    const cc = doc.axes[axis].cost_confirmed;
    if (cc != null && (interview === null || interview.source !== "file")) {
      err(`I6 axes.${axis}.cost_confirmed set but no answers-file interview supplied it`);
    }
  }
  if (interview === null && doc.backlog !== null) {
    err("I6 backlog produced without any interview input (ranking without a human)");
  }
  if (interview === null && doc.migration_readiness !== null) {
    err("I6 migration_readiness produced without any interview input");
  }
  if (interview !== null && doc.meta.mode !== "interactive") {
    err("I6 interview present but meta.mode is not 'interactive' (Phase 2 ran in a mode that forbids it)");
  }
  const anyLikelihood = AXES.some((a) => doc.axes[a].likelihood !== null);
  if (anyLikelihood && doc.backlog === null) {
    err("I6 likelihood was supplied but backlog is null — the maintainer answered; the ranking is owed");
  }
  if (doc.backlog !== null && !anyLikelihood) {
    err("I6 backlog ranked without any likelihood input on any axis");
  }

  // I7: undetermined/other pairing rules
  const checkHatches = (classification: string, findingIds: string[], vendor: string, where: string) => {
    if (classification === "undetermined" && !gapVendors.has(vendor)) {
      warn(`I7 ${where} is 'undetermined' but no coverage.gaps entry for vendor '${vendor}'`);
    }
    if (classification === "other") {
      const kinds = new Set(findingIds.map((fid) => findings.get(fid)?.claim));
      if (!kinds.has("presence")) err(`I7 ${where} is 'other' but cites no presence finding`);
    }
  };
  for (const [vendor, sigs] of Object.entries(doc.boundary)) {
    for (const [sig, a] of Object.entries(sigs)) checkHatches(a.status, a.finding_ids, vendor, `boundary.${vendor}.${sig}`);
  }
  for (const axis of AXES) {
    for (const [vendor, pv] of Object.entries(doc.axes[axis].per_vendor)) {
      for (const key of ["classification", "claims_handling", "api_token_type"] as const) {
        const value = pv[key];
        if (value !== undefined) checkHatches(value, pv.finding_ids, vendor, `axes.${axis}.${vendor}.${key}`);
      }
    }
  }

  // I9: answers-file fidelity. When the audited root carries _interview.yaml,
  // the file is GROUND-TRUTH INPUT — the one part of the run whose correct
  // output is fully known in advance. The JSON must reproduce it faithfully:
  // answers verbatim, likelihood per the documented mapping, cost_confirmed
  // honored. This is the input→output check that live interviews can't have.
  const interviewPath = join(codeRoot, "_interview.yaml");
  if (existsSync(interviewPath)) {
    const file = loadInterviewFile(interviewPath);
    if (interview === null) {
      warn("I9 _interview.yaml present but interview is null (deliberate non-interactive run?)");
    } else {
      if (interview.source !== "file") {
        err(`I9 _interview.yaml present but interview.source is '${interview.source}', not 'file'`);
      }
      const fileAxes = Object.keys(file).sort().join(",");
      const jsonAxes = Object.keys(interview.answers).sort().join(",");
      if (fileAxes !== jsonAxes) {
        err(`I9 answered axes mismatch: file has [${fileAxes}], interview.answers has [${jsonAxes}]`);
      }
      for (const axis of AXES) {
        const fromFile = file[axis];
        if (!fromFile) continue;
        const recorded = interview.answers[axis];
        if (recorded && recorded.answer !== fromFile.answer) {
          err(`I9 ${axis}: answer recorded as '${recorded.answer}' but the file says '${fromFile.answer}' — the human's words, verbatim`);
        }
        const expected = LIKELIHOOD_MAPPING[axis][fromFile.answer];
        if (expected !== undefined && doc.axes[axis].likelihood !== expected) {
          err(`I9 ${axis}: likelihood '${doc.axes[axis].likelihood}' does not match the documented mapping ('${fromFile.answer}' → ${expected})`);
        }
        const cc = doc.axes[axis].cost_confirmed ?? null;
        if (cc !== (fromFile.cost_confirmed ?? null)) {
          err(`I9 ${axis}: cost_confirmed '${cc}' but the file says '${fromFile.cost_confirmed ?? null}'`);
        }
      }
    }
  } else if (interview?.source === "file") {
    err("I9 interview.source is 'file' but no _interview.yaml exists at the audited root");
  }

  // I8: no duration language in the SKILL'S OWN VOICE. Human-attributed text
  // (questions put to the maintainer, their recorded answers) and verbatim
  // code quotes are exempt — asking about the human's timeline or quoting the
  // code's constants is not the skill estimating effort.
  const I8_EXEMPT = [
    /^\$\.interview\.answers\.[a-z_]+\.(answer|notes)$/,
    /^\$\.judgment_calls\[\d+\]\.(question|context)$/,
    /^\$\.findings\[\d+\]\.evidence\[\d+\]\.quote$/,
  ];
  for (const [path, s] of walkStrings(doc)) {
    if (I8_EXEMPT.some((rx) => rx.test(path))) continue;
    const m = DURATION_RX.exec(s);
    if (m) err(`I8 duration language at ${path}: ...${m[0]}...`);
  }

  return { errors, warnings, findings: doc.findings.length, references: refs.length };
}
