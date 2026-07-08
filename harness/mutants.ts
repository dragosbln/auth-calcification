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

// sanity: the unmutated golden file must still pass the full stack
const clean = spawnSync(process.execPath, [CHECK, GOLDEN, FIXTURE], { encoding: "utf8" });
if (clean.status !== 0) {
  failures++;
  console.log("FAIL   golden file itself no longer passes the full check");
} else {
  console.log("OK     unmutated golden file still passes");
}

process.exit(failures ? 1 : 0);
