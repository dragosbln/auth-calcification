#!/usr/bin/env node
/**
 * Mutation test for the whole validation stack — "test the test layer"
 * (decisions.md D11).
 *
 * Takes the known-good golden file, applies one targeted corruption at a
 * time, and asserts that check.ts CATCHES each mutant — and catches it in
 * the EXPECTED LAYER. A mutant that slips through means a check is silently
 * broken; a mutant caught by the wrong layer means the layering story
 * (shape vs relations) is miswired.
 *
 *   node mutants.ts
 *
 * Exit code 0 = every mutant caught in its expected layer AND the unmutated
 * golden file still passes; 1 otherwise.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const CHECK = join(HARNESS_DIR, "check.ts");
const GOLDEN = join(HARNESS_DIR, "golden/mixed-edge-cases.audit.json");
const FIXTURE = join(HARNESS_DIR, "../fixtures/mixed-edge-cases");

// deliberately loose typing: mutations reach into arbitrary depths, and the
// checker under test is what enforces the real shape.
type Doc = any;
type Layer = "schema" | "invariants";

const golden: Doc = JSON.parse(readFileSync(GOLDEN, "utf8"));
const outDir = mkdtempSync(join(tmpdir(), "audit-mutants-"));

// interactive base — the only committed artifact that carries an _interview.yaml
// (in its fixture dir), so the only one that can exercise the I9 fidelity family
const INTERACTIVE_ROOT = join(HARNESS_DIR, "../fixtures/calcified-cognito-interactive");
const interactiveBase: Doc = JSON.parse(readFileSync(join(INTERACTIVE_ROOT, "auth-calcification-audit.json"), "utf8"));

// I9 (answers-file fidelity) mutations — all layer-2. The file says storage:
// "Yes — planned"/cost moderate, refresh: "Tied to storage" (→ medium).
const I9_MUTATIONS: Array<{ name: string; layer: Layer; apply: (d: Doc) => void }> = [
  { name: "i9_source_not_file", layer: "invariants", apply: (d) => (d.interview.source = "live") },
  {
    name: "i9_answer_not_verbatim",
    layer: "invariants",
    apply: (d) => (d.interview.answers.storage.answer = "Yes, we plan to"),
  },
  {
    name: "i9_wrong_likelihood_mapping",
    layer: "invariants",
    apply: (d) => (d.axes.refresh.likelihood = "high"), // file says "Tied to storage" → medium
  },
  {
    name: "i9_cost_confirmed_dropped",
    layer: "invariants",
    apply: (d) => delete d.axes.storage.cost_confirmed, // file says moderate
  },
];

const MUTATIONS: Array<{ name: string; layer: Layer; apply: (d: Doc) => void }> = [
  // ---- layer 1: shape violations (ajv should catch these) ----
  {
    // an artifact from the previous schema generation must not validate —
    // keep this value one version BEHIND the schema's const
    name: "outdated_schema_version",
    layer: "schema",
    apply: (d) => (d.schema_version = "1.1"),
  },
  {
    name: "invalid_enum_classification",
    layer: "schema",
    apply: (d) => (d.axes.storage.per_vendor.cognito.classification = "custom-ish"),
  },
  {
    name: "missing_required_statement",
    layer: "schema",
    apply: (d) => delete d.findings[0].statement,
  },
  {
    // the "no stored counts" normalization rule, enforced structurally:
    // an undeclared property anywhere is rejected
    name: "undeclared_count_property",
    layer: "schema",
    apply: (d) => (d.leak_count = 7),
  },
  {
    // escape hatch used silently — 'other' requires a note (schema if/then)
    name: "other_without_note",
    layer: "schema",
    apply: (d) => {
      d.axes.storage.per_vendor.cognito.classification = "other";
      delete d.axes.storage.per_vendor.cognito.note;
    },
  },
  {
    // the presence/absence discriminated union: an absence claim carrying
    // evidence anchors is contradictory (unevaluatedProperties rejects it)
    name: "absence_with_evidence",
    layer: "schema",
    apply: (d) =>
      (d.findings[1].evidence = [{ file: "src/auth/types.ts", line: 3, quote: "export interface Principal {" }]),
  },
  {
    // a determined verdict with no cited evidence — minItems 1 on the
    // else-branch makes "evidence-backed statuses" structural
    name: "absent_status_without_findings",
    layer: "schema",
    apply: (d) => (d.boundary.cognito.b3_contract_tested.finding_ids = []),
  },
  {
    // register enforcement: statements are claims, not essays — guards the
    // maxLength ceilings' existence (calibrated in D20)
    name: "essay_as_statement",
    layer: "schema",
    apply: (d) => (d.findings[0].statement = "This finding matters because ".repeat(20)),
  },

  // ---- layer 2: relational violations (shape-valid, invariants catch) ----
  {
    // the committed report's actual bug class: an off-by-N anchor
    name: "wrong_line",
    layer: "invariants",
    apply: (d) => (d.findings[6].evidence[1].line = 24),
  },
  {
    name: "fabricated_quote",
    layer: "invariants",
    apply: (d) => (d.findings[6].evidence[1].quote = "setKeyValueStorage(new CookieStorage())"),
  },
  {
    // 'high' is a legal enum value — the fabrication is only visible
    // cross-field (no interview to source it from). Shape-valid on purpose.
    name: "fabricated_likelihood",
    layer: "invariants",
    apply: (d) => (d.axes.storage.likelihood = "high"),
  },
  {
    name: "silent_vendor_drop",
    layer: "invariants",
    apply: (d) => (d.coverage.gaps = []),
  },
  {
    name: "duration_estimate",
    layer: "invariants",
    apply: (d) => (d.axes.refresh.cost_evidence.basis = "roughly 2 dev-weeks of work across both surfaces"),
  },
  {
    // a shape-valid, quote-valid finding that nothing references — only the
    // bidirectional integrity check can see it
    name: "orphan_finding",
    layer: "invariants",
    apply: (d) =>
      d.findings.push({
        id: "storage-cognito-unreferenced-duplicate",
        vendor: "cognito",
        claim: "presence",
        statement: "Duplicate of the selector finding that nothing references.",
        evidence: [
          {
            file: "src/auth/adapters/cognito.ts",
            line: 22,
            quote: "cognitoUserPoolsTokenProvider.setKeyValueStorage(sessionStorage);",
          },
        ],
      }),
  },
  {
    name: "backlog_without_interview",
    layer: "invariants",
    apply: (d) =>
      (d.backlog = [
        { task: "add contract suite", axes: ["storage"], why: "x", finding_ids: ["b3-cognito-no-contract-suite"] },
      ]),
  },
  {
    // Phase 2 ran in a mode that forbids it — interview data in a
    // non-interactive run is a mode-contract violation
    name: "interview_in_noninteractive_mode",
    layer: "invariants",
    apply: (d) => {
      d.interview = { source: "live", answers: { storage: { answer: "Yes — planned" } } };
      d.axes.storage.likelihood = "high";
      d.backlog = [{ task: "own the storage seam", axes: ["storage"], why: "x", finding_ids: ["storage-cognito-builtin-selector"] }];
    },
  },
  {
    // the maintainer answered but no ranking was produced — the ranking is owed
    name: "answered_but_unranked",
    layer: "invariants",
    apply: (d) => {
      d.meta.mode = "interactive";
      d.interview = { source: "live", answers: { storage: { answer: "Yes — planned" } } };
      d.axes.storage.likelihood = "high";
      // backlog stays null
    },
  },
];

function catchingLayer(stdout: string): Layer | null {
  if (stdout.split("\n").some((l) => l.startsWith("SCHEMA "))) return "schema";
  if (stdout.split("\n").some((l) => l.startsWith("ERROR "))) return "invariants";
  return null;
}

let failures = 0;
for (const { name, layer: expected, apply } of MUTATIONS) {
  const doc: Doc = structuredClone(golden);
  apply(doc);
  const mutantPath = join(outDir, `mutant_${name}.json`);
  writeFileSync(mutantPath, JSON.stringify(doc));

  const r = spawnSync(process.execPath, [CHECK, mutantPath, FIXTURE], { encoding: "utf8" });
  const caught = r.status !== 0;
  const actual = catchingLayer(r.stdout);
  const firstHit =
    r.stdout.split("\n").find((l) => l.startsWith("SCHEMA ") || l.startsWith("ERROR ")) ?? "(no violation line)";

  if (!caught) {
    failures++;
    console.log(`MISSED            ${name}: mutant passed the full check`);
  } else if (actual !== expected) {
    failures++;
    console.log(`WRONG LAYER       ${name}: expected ${expected}, caught by ${actual} — ${firstHit}`);
  } else {
    console.log(`CAUGHT [${expected.padEnd(10)}] ${name}: ${firstHit}`);
  }
}

// I9 mutations run against the interactive fixture (its dir has _interview.yaml)
for (const { name, layer: expected, apply } of I9_MUTATIONS) {
  const doc: Doc = structuredClone(interactiveBase);
  apply(doc);
  const mutantPath = join(outDir, `mutant_${name}.json`);
  writeFileSync(mutantPath, JSON.stringify(doc));

  const r = spawnSync(process.execPath, [CHECK, mutantPath, INTERACTIVE_ROOT], { encoding: "utf8" });
  const caught = r.status !== 0;
  const actual = catchingLayer(r.stdout);
  const firstHit = r.stdout.split("\n").find((l) => l.startsWith("ERROR I9")) ?? "(no I9 line)";

  if (!caught) {
    failures++;
    console.log(`MISSED            ${name}: mutant passed the full check`);
  } else if (actual !== expected) {
    failures++;
    console.log(`WRONG LAYER       ${name}: expected ${expected}, caught by ${actual}`);
  } else {
    console.log(`CAUGHT [${expected.padEnd(10)}] ${name}: ${firstHit}`);
  }
}

// sanity: the unmutated golden AND interactive fixture must still pass
const clean = spawnSync(process.execPath, [CHECK, GOLDEN, FIXTURE], { encoding: "utf8" });
if (clean.status !== 0) {
  failures++;
  console.log("FAIL   golden file itself no longer passes the full check");
} else {
  console.log("OK     unmutated golden file still passes");
}
const cleanI = spawnSync(process.execPath, [CHECK, join(INTERACTIVE_ROOT, "auth-calcification-audit.json"), INTERACTIVE_ROOT], { encoding: "utf8" });
if (cleanI.status !== 0) {
  failures++;
  console.log("FAIL   interactive fixture no longer passes the full check");
} else {
  console.log("OK     unmutated interactive fixture still passes");
}

process.exit(failures ? 1 : 0);
