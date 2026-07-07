#!/usr/bin/env node
/**
 * Mutation test for the invariant checker — "test the test layer" (decisions.md D11).
 *
 * Takes the known-good golden file, applies one targeted corruption per
 * invariant family, and asserts the checker CATCHES each mutant. A mutant
 * that slips through means an invariant is silently broken.
 *
 *   node mutants.ts
 *
 * Exit code 0 = every mutant caught; 1 = at least one MISSED.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const CHECKER = join(HARNESS_DIR, "check_invariants.ts");
const GOLDEN = join(HARNESS_DIR, "golden/mixed-edge-cases.audit.json");
const FIXTURE = join(HARNESS_DIR, "../fixtures/mixed-edge-cases");

// deliberately loose typing: mutations reach into arbitrary depths,
// and the checker under test is what enforces the real shape.
type Doc = any;

const golden: Doc = JSON.parse(readFileSync(GOLDEN, "utf8"));
const outDir = mkdtempSync(join(tmpdir(), "audit-mutants-"));

const MUTATIONS: Array<{ name: string; apply: (d: Doc) => void }> = [
  {
    // the committed report's actual bug class: an off-by-N anchor
    name: "wrong_line",
    apply: (d) => (d.findings[6].evidence[1].line = 24),
  },
  {
    name: "fabricated_quote",
    apply: (d) => (d.findings[6].evidence[1].quote = "setKeyValueStorage(new CookieStorage())"),
  },
  {
    name: "fabricated_likelihood",
    apply: (d) => (d.axes.storage.likelihood = "high"),
  },
  {
    name: "silent_vendor_drop",
    apply: (d) => (d.coverage.gaps = []),
  },
  {
    name: "duration_estimate",
    apply: (d) => (d.axes.refresh.cost_evidence.basis = "roughly 2 dev-weeks of work across both surfaces"),
  },
  {
    name: "orphan_finding",
    apply: (d) => (d.boundary.cognito.b3_contract_tested.finding_ids = []),
  },
  {
    name: "backlog_without_interview",
    apply: (d) =>
      (d.backlog = [{ task: "add contract suite", axes: ["storage"], why: "x", finding_ids: ["b3-cognito-no-contract-suite"] }]),
  },
];

let missed = 0;
for (const { name, apply } of MUTATIONS) {
  const doc: Doc = structuredClone(golden);
  apply(doc);
  const mutantPath = join(outDir, `mutant_${name}.json`);
  writeFileSync(mutantPath, JSON.stringify(doc));

  const r = spawnSync(process.execPath, [CHECKER, mutantPath, FIXTURE], { encoding: "utf8" });
  const caught = r.status !== 0;
  if (!caught) missed++;
  const firstErr = r.stdout.split("\n").find((l) => l.startsWith("ERROR")) ?? "(no error line)";
  console.log(`${caught ? "CAUGHT" : "MISSED"}  ${name}: ${firstErr}`);
}

// sanity: the unmutated golden file must still pass
const clean = spawnSync(process.execPath, [CHECKER, GOLDEN, FIXTURE], { encoding: "utf8" });
if (clean.status !== 0) {
  console.log("FAIL   golden file itself no longer passes the checker");
  missed++;
} else {
  console.log("OK     unmutated golden file still passes");
}

process.exit(missed ? 1 : 0);
