#!/usr/bin/env node
/**
 * Cross-format agreement CLI — validate one artifact trio.
 *
 *   node agree.ts <dir>
 *
 * <dir> must contain auth-calcification-audit{.json,-report.md,-summary.md}.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { checkAgreement } from "./lib/agreement.ts";
import type { AuditDoc } from "./lib/types.ts";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node agree.ts <dir-with-artifact-trio>");
  process.exit(2);
}

const doc = JSON.parse(readFileSync(join(dir, "auth-calcification-audit.json"), "utf8")) as AuditDoc;
const report = readFileSync(join(dir, "auth-calcification-audit-report.md"), "utf8");
const summary = readFileSync(join(dir, "auth-calcification-audit-summary.md"), "utf8");

const res = checkAgreement(doc, report, summary);
for (const w of res.warnings) console.log(`WARN  ${w}`);
for (const e of res.errors) console.log(`ERROR ${e}`);
console.log(res.errors.length ? `${res.errors.length} agreement violation(s)` : "AGREEMENT OK");
process.exit(res.errors.length ? 1 : 0);
