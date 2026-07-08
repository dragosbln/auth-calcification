#!/usr/bin/env node
/**
 * Validate every committed audit JSON in the repo through both layers:
 *
 *   - the hand-written golden file (against the mixed-edge-cases fixture)
 *   - every fixture's committed auth-calcification-audit.json (against that
 *     fixture's own source)
 *
 * Entirely free (no LLM calls) and fast, so it runs on every commit via the
 * pre-commit hook. Its main job there: catch edits that silently break the
 * anchors — change a fixture source file and every committed finding whose
 * quote or line number no longer matches fails I4 at commit time, not at the
 * next expensive live run.
 *
 * Self-extending: as more fixtures get regenerated with JSON artifacts
 * (step 5/6), they are picked up automatically.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { validateShape } from "./lib/schema.ts";
import { checkInvariants } from "./lib/invariants.ts";
import type { AuditDoc } from "./lib/types.ts";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HARNESS_DIR, "../fixtures");

interface Target {
  name: string;
  json: string;
  codeRoot: string;
}

const targets: Target[] = [
  {
    name: "golden/mixed-edge-cases.audit.json",
    json: join(HARNESS_DIR, "golden/mixed-edge-cases.audit.json"),
    codeRoot: join(FIXTURES, "mixed-edge-cases"),
  },
];
for (const entry of readdirSync(FIXTURES, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const json = join(FIXTURES, entry.name, "auth-calcification-audit.json");
  if (existsSync(json)) {
    targets.push({ name: `fixtures/${entry.name}`, json, codeRoot: join(FIXTURES, entry.name) });
  }
}

let failed = 0;
for (const t of targets) {
  const doc: unknown = JSON.parse(readFileSync(t.json, "utf8"));
  const shapeErrors = validateShape(doc);
  if (shapeErrors.length) {
    failed++;
    console.log(`FAIL ${t.name}`);
    for (const e of shapeErrors) console.log(`  SCHEMA ${e}`);
    continue;
  }
  const res = checkInvariants(doc as AuditDoc, t.codeRoot);
  for (const w of res.warnings) console.log(`  WARN  ${w}`);
  if (res.errors.length) {
    failed++;
    console.log(`FAIL ${t.name}`);
    for (const e of res.errors) console.log(`  ERROR ${e}`);
  } else {
    console.log(`PASS ${t.name} (${res.findings} findings, ${res.references} references)`);
  }
}

process.exit(failed ? 1 : 0);
