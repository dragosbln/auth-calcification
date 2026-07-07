#!/usr/bin/env node
/**
 * Prototype of the harness invariant checker (build-plan step 4 preview).
 *
 * Checks the relational invariants JSON Schema cannot express, against a
 * candidate audit JSON + the audited codebase root. Zero dependencies —
 * runs on Node >= 23.6 via native type stripping:
 *
 *   node check_invariants.ts <audit.json> <code-root>
 *
 * Exit code 0 = all invariants pass; 1 = at least one ERROR.
 * Formal JSON Schema (shape) validation is separate and comes with ajv in
 * the full harness; this file covers what a schema validator cannot see.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const AXES = ["storage", "refresh", "identity_provider", "authorization"] as const;
type Axis = (typeof AXES)[number];

const DURATION_RX =
  /\b\d+(\.\d+)?\s*(-\s*\d+(\.\d+)?\s*)?(hour|hr|day|week|sprint|month|dev-week|man-day|person-day)s?\b/i;

interface EvidenceAnchor {
  file: string;
  line: number;
  quote: string;
}

interface Finding {
  id: string;
  vendor: string | null;
  signals: string[];
  claim: "presence" | "absence";
  statement: string;
  note?: string;
  evidence?: EvidenceAnchor[];
  checked_patterns?: string[];
  searched?: string[];
}

interface SignalAssessment {
  status: "present" | "partial" | "absent" | "not_applicable" | "undetermined";
  finding_ids: string[];
  note?: string;
}

interface AxisPerVendor {
  classification?: string;
  claims_handling?: string;
  api_token_type?: string;
  finding_ids: string[];
  note?: string;
}

interface AxisAssessment {
  per_vendor: Record<string, AxisPerVendor>;
  recommended_seam: string;
  likelihood: string | null;
  cost_evidence: { level: string; basis: string; finding_ids?: string[] };
  cost_confirmed?: string | null;
}

interface AuditDoc {
  schema_version: string;
  meta: Record<string, unknown>;
  vendors: Array<{ id: string; profile: string | null; [k: string]: unknown }>;
  coverage: {
    comprehensive: Array<{ path: string; reason: string }>;
    sampled: Array<{ path: string; note?: string }>;
    gaps: Array<{ reason: string; path?: string; vendor?: string }>;
  };
  findings: Finding[];
  boundary: Record<string, Record<string, SignalAssessment>>;
  axes: Record<Axis, AxisAssessment>;
  interview: { source: "live" | "file"; answers: Record<string, { answer: string; notes?: string }> } | null;
  judgment_calls: Array<{ axis: Axis | null; question: string; context?: string; finding_ids?: string[] }>;
  backlog: Array<{ task: string; axes: Axis[]; why: string; finding_ids: string[]; scope_paths?: string[] }> | null;
  migration_readiness: unknown[] | null;
  synthesis: { posture: string; headline: { text: string; finding_ids: string[] } };
}

const errors: string[] = [];
const warnings: string[] = [];
const err = (msg: string) => void errors.push(msg);
const warn = (msg: string) => void warnings.push(msg);

function* walkStrings(node: unknown, path = "$"): Generator<[string, string]> {
  if (typeof node === "string") {
    yield [path, node];
  } else if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* walkStrings(node[i], `${path}[${i}]`);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) yield* walkStrings(v, `${path}.${k}`);
  }
}

function main(auditPath: string, codeRoot: string): void {
  const doc: AuditDoc = JSON.parse(readFileSync(auditPath, "utf8"));

  const findings = new Map<string, Finding>(doc.findings.map((f) => [f.id, f]));

  // I1: finding ids unique
  const ids = doc.findings.map((f) => f.id);
  for (const dup of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
    err(`I1 duplicate finding id: ${dup}`);
  }

  // Collect every finding_ids reference with the signal context it appears under
  type Ref = { signal: string | null; findingId: string; where: string };
  const refs: Ref[] = [];
  for (const [vendor, sigs] of Object.entries(doc.boundary)) {
    for (const [sig, assessment] of Object.entries(sigs)) {
      for (const fid of assessment.finding_ids) refs.push({ signal: sig, findingId: fid, where: `boundary.${vendor}.${sig}` });
    }
  }
  for (const axis of AXES) {
    for (const [vendor, pv] of Object.entries(doc.axes[axis].per_vendor)) {
      for (const fid of pv.finding_ids) refs.push({ signal: axis, findingId: fid, where: `axes.${axis}.per_vendor.${vendor}` });
    }
    for (const fid of doc.axes[axis].cost_evidence.finding_ids ?? []) {
      refs.push({ signal: null, findingId: fid, where: `axes.${axis}.cost_evidence` });
    }
  }
  doc.judgment_calls.forEach((jc, i) => {
    for (const fid of jc.finding_ids ?? []) refs.push({ signal: null, findingId: fid, where: `judgment_calls[${i}]` });
  });
  for (const fid of doc.synthesis.headline.finding_ids) {
    refs.push({ signal: null, findingId: fid, where: "synthesis.headline" });
  }
  (doc.backlog ?? []).forEach((item, i) => {
    for (const fid of item.finding_ids) refs.push({ signal: null, findingId: fid, where: `backlog[${i}]` });
  });

  // I2: every reference resolves
  for (const r of refs) {
    if (!findings.has(r.findingId)) err(`I2 unresolved finding id '${r.findingId}' at ${r.where}`);
  }

  // I3: bidirectional signal integrity
  for (const r of refs) {
    const f = findings.get(r.findingId);
    if (r.signal && f && !f.signals.includes(r.signal)) {
      err(`I3 ${r.where} cites '${r.findingId}' but its signals [${f.signals}] lack '${r.signal}'`);
    }
  }
  const referenced = new Set(refs.map((r) => r.findingId));
  for (const fid of findings.keys()) {
    if (!referenced.has(fid)) err(`I3 orphan finding never referenced by any assessment: ${fid}`);
  }

  // I4: evidence quotes verify against the codebase (presence claims)
  for (const f of doc.findings) {
    if (f.claim !== "presence") continue;
    for (const ev of f.evidence ?? []) {
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

  // I8: no duration language anywhere
  for (const [path, s] of walkStrings(doc)) {
    const m = DURATION_RX.exec(s);
    if (m) err(`I8 duration language at ${path}: ...${m[0]}...`);
  }

  console.log(`checked ${doc.findings.length} findings, ${refs.length} references`);
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  if (errors.length === 0) console.log("ALL INVARIANTS PASS");
  process.exit(errors.length ? 1 : 0);
}

const [auditPath, codeRoot] = process.argv.slice(2);
if (!auditPath || !codeRoot) {
  console.error("usage: node check_invariants.ts <audit.json> <code-root>");
  process.exit(2);
}
main(auditPath, codeRoot);
