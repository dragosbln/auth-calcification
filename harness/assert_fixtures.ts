#!/usr/bin/env node
/**
 * Evaluate every expectation file against the committed fixture artifacts
 * (build-plan step 6). Free — no LLM calls — so it runs in `npm test` and
 * therefore in the pre-commit hook.
 *
 *   node assert_fixtures.ts [expectations-dir]
 *
 * Two file shapes live in expectations/:
 *   - fixture assertions ({fixture, assertions}) — ground truth for one
 *     fixture's committed audit JSON
 *   - structural-equality specs — enum-level agreement between two fixtures'
 *     audits (the bounded-pair portability test)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { evaluate, evaluateEquality, isEqualitySpec } from "./lib/expectations.ts";
import type { ExpectationFile } from "./lib/expectations.ts";
import type { AuditDoc } from "./lib/types.ts";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HARNESS_DIR, "../fixtures");
const EXPECTATIONS = process.argv[2] ?? join(HARNESS_DIR, "expectations");

function loadFixtureDoc(fixture: string): AuditDoc | null {
  const p = join(FIXTURES, fixture, "auth-calcification-audit.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as AuditDoc) : null;
}

let failed = 0;
for (const file of readdirSync(EXPECTATIONS).filter((f) => f.endsWith(".json")).sort()) {
  const spec = JSON.parse(readFileSync(join(EXPECTATIONS, file), "utf8")) as ExpectationFile;

  let errors: string[];
  let label: string;
  if (isEqualitySpec(spec)) {
    label = `${file} (${spec.paths.length} paths)`;
    const docs: Record<string, AuditDoc> = {};
    const missing = spec.fixtures.filter((f) => {
      const d = loadFixtureDoc(f);
      if (d) docs[f] = d;
      return !d;
    });
    errors = missing.length
      ? missing.map((f) => `no committed audit JSON for fixture '${f}'`)
      : evaluateEquality(spec, docs);
  } else {
    label = `${file} (${spec.assertions.length} assertions)`;
    const doc = loadFixtureDoc(spec.fixture);
    errors = doc ? evaluate(doc, spec.assertions) : [`no committed audit JSON for fixture '${spec.fixture}'`];
  }

  if (errors.length) {
    failed++;
    console.log(`FAIL ${label}`);
    for (const e of errors) console.log(`  EXPECT ${e}`);
  } else {
    console.log(`PASS ${label}`);
  }
}

process.exit(failed ? 1 : 0);
