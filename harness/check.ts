#!/usr/bin/env node
/**
 * Validate a candidate audit JSON — the harness's main entry point.
 *
 *   node check.ts <audit.json> <code-root>
 *
 * Runs the two deterministic layers in order, FAIL-FAST:
 *   1. shape      (lib/schema.ts    — ajv against the skill's audit-schema.json)
 *   2. invariants (lib/invariants.ts — relations, quotes vs code, non-negotiables)
 *
 * Layer 2 only runs when layer 1 passes — the invariant code is allowed to
 * assume a well-formed document instead of defensive-coding every access.
 *
 * Output contract (mutants.ts and future CI parse this):
 *   "SCHEMA <path>: <message>"  — layer-1 violation
 *   "ERROR I<n> <message>"      — layer-2 violation
 *   "WARN  I<n> <message>"      — layer-2 warning (non-fatal)
 *   exit 0 ⇔ no violations.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { validateShape } from "./lib/schema.ts";
import { checkInvariants } from "./lib/invariants.ts";
import type { AuditDoc } from "./lib/types.ts";

const [auditPath, codeRoot] = process.argv.slice(2);
if (!auditPath || !codeRoot) {
  console.error("usage: node check.ts <audit.json> <code-root>");
  process.exit(2);
}

const doc: unknown = JSON.parse(readFileSync(auditPath, "utf8"));

const shapeErrors = validateShape(doc);
if (shapeErrors.length > 0) {
  for (const e of shapeErrors) console.log(`SCHEMA ${e}`);
  console.log(`${shapeErrors.length} schema violation(s) — invariants not run (layer 2 assumes a valid shape)`);
  process.exit(1);
}

const res = checkInvariants(doc as AuditDoc, codeRoot);
console.log(`shape valid — checked ${res.findings} findings, ${res.references} references`);
for (const w of res.warnings) console.log(`WARN  ${w}`);
for (const e of res.errors) console.log(`ERROR ${e}`);
if (res.errors.length === 0) console.log("ALL CHECKS PASS");
process.exit(res.errors.length ? 1 : 0);
