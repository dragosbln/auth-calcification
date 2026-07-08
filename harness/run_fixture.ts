#!/usr/bin/env node
/**
 * Headless fixture runner — invokes the ACTUAL skill on a fixture and
 * validates what comes back (build-plan step 5).
 *
 *   node run_fixture.ts [fixture] [--model <m>] [--max-turns <n>]
 *
 * Model defaults to Opus 4.7 — the skill's minimum verified tier, so test
 * runs exercise the weakest model we recommend (decisions.md D19). Override
 * with --model for matrix runs.
 *
 * What it does, in order:
 *   1. Copies the fixture into a fresh workspace under harness/runs/<id>/
 *      (excluding any previously committed audit artifacts, so every run
 *      starts clean and the committed fixtures are never touched).
 *   2. Spawns `claude -p` in that workspace with `--plugin-dir` pointing at
 *      the real plugin — the same packaging a user installs, not a copy of
 *      the skill. Non-interactive, bypassPermissions (the workspace is a
 *      throwaway copy of synthetic code; CI should narrow this).
 *   3. Harvests the three artifacts the skill must produce.
 *   4. Validates the JSON through both harness layers (shape + invariants),
 *      with evidence quotes verified against the workspace code the model
 *      actually audited.
 *
 * Exit 0 ⇔ the run produced all three artifacts AND the JSON passes the
 * full deterministic stack. Everything (workspace, artifacts, claude's
 * result metadata, stderr) is preserved under harness/runs/<id>/ for
 * inspection; runs/ is gitignored.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { validateShape } from "./lib/schema.ts";
import { checkInvariants } from "./lib/invariants.ts";
import { evaluate } from "./lib/expectations.ts";
import { checkAgreement } from "./lib/agreement.ts";
import type { FixtureExpectations } from "./lib/expectations.ts";
import type { AuditDoc } from "./lib/types.ts";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = join(HARNESS_DIR, "..");
const PLUGIN_DIR = join(REPO, "skill/auth-calcification-audit");

// --- args ---
const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DEFAULT_MODEL = "claude-opus-4-7";

const fixture = positional[0] ?? "calcified-cognito";
const model = flag("model") ?? DEFAULT_MODEL;
const maxTurns = flag("max-turns") ?? "150";

const fixtureDir = join(REPO, "fixtures", fixture);
if (!existsSync(fixtureDir)) {
  console.error(`unknown fixture: ${fixture}`);
  process.exit(2);
}

// --- 1. fresh workspace ---
const runId = `${fixture}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const runDir = join(HARNESS_DIR, "runs", runId);
const workspace = join(runDir, "workspace");
mkdirSync(workspace, { recursive: true });
cpSync(fixtureDir, workspace, {
  recursive: true,
  filter: (src) => {
    const name = basename(src);
    if (name === "node_modules") return false;
    // start clean: committed artifacts from old manual runs stay out
    if (/^auth-calcification-audit.*\.(md|json)$/.test(name)) return false;
    return true;
  },
});
console.log(`workspace: ${workspace}`);

// --- 2. headless skill run ---
const PROMPT =
  "Run the auth-calcification-audit skill on this repository with interactive=false. " +
  "Audit the current directory. Work fully autonomously — do not ask the user anything. " +
  "Save all artifacts to the repository root exactly as the skill specifies.";

const claudeBin = process.env.CLAUDE_BIN ?? "claude";
const args = [
  "-p", PROMPT,
  "--plugin-dir", PLUGIN_DIR,
  "--permission-mode", "bypassPermissions",
  "--output-format", "json",
  "--max-turns", maxTurns,
  "--model", model,
];

// avoid nested-session detection when the runner is itself launched from
// inside a Claude Code session
const env = { ...process.env };
delete env.CLAUDECODE;

console.log(`invoking: ${claudeBin} -p … --plugin-dir ${PLUGIN_DIR} --model ${model}`);
const started = Date.now();
const r = spawnSync(claudeBin, args, {
  cwd: workspace,
  env,
  encoding: "utf8",
  timeout: 20 * 60 * 1000,
  maxBuffer: 64 * 1024 * 1024,
});
writeFileSync(join(runDir, "claude-stdout.json"), r.stdout ?? "");
writeFileSync(join(runDir, "claude-stderr.txt"), r.stderr ?? "");

if (r.error) {
  console.error(`claude failed to launch: ${r.error.message}`);
  process.exit(1);
}

interface ClaudeResult {
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  [k: string]: unknown;
}
let meta: ClaudeResult = {};
try {
  meta = JSON.parse(r.stdout) as ClaudeResult;
} catch {
  console.error("claude stdout was not parseable JSON — see claude-stdout.json");
}
console.log(
  `run finished in ${Math.round((Date.now() - started) / 1000)}s — ` +
    `turns: ${meta.num_turns ?? "?"}, cost: $${meta.total_cost_usd?.toFixed(2) ?? "?"}, ` +
    `is_error: ${meta.is_error ?? "?"} (exit ${r.status})`,
);
if (r.status !== 0 || meta.is_error) {
  console.error("headless run failed — see claude-stdout.json / claude-stderr.txt");
  process.exit(1);
}

// --- 3. harvest artifacts ---
const expected = [
  "auth-calcification-audit.json",
  "auth-calcification-audit-report.md",
  "auth-calcification-audit-summary.md",
];
const missing = expected.filter((f) => !existsSync(join(workspace, f)));
if (missing.length) {
  console.error(`missing artifact(s): ${missing.join(", ")}`);
  console.error(`workspace root now contains: ${readdirSync(workspace).join(", ")}`);
  process.exit(1);
}
for (const f of expected) cpSync(join(workspace, f), join(runDir, f));
console.log(`artifacts: all three present`);

// --- 4. validate the JSON through both layers ---
const doc: unknown = JSON.parse(readFileSync(join(workspace, expected[0]), "utf8"));
const shapeErrors = validateShape(doc);
if (shapeErrors.length) {
  for (const e of shapeErrors) console.log(`SCHEMA ${e}`);
  console.log(`${shapeErrors.length} schema violation(s) — invariants not run`);
  process.exit(1);
}
const res = checkInvariants(doc as AuditDoc, workspace);
console.log(`shape valid — checked ${res.findings} findings, ${res.references} references`);
for (const w of res.warnings) console.log(`WARN  ${w}`);
for (const e of res.errors) console.log(`ERROR ${e}`);
if (res.errors.length) {
  console.log(`run artifacts kept at ${runDir}`);
  process.exit(1);
}

// --- 5. fixture ground truth, when this fixture has an expectation file ---
const expPath = join(HARNESS_DIR, "expectations", `${fixture}.json`);
if (existsSync(expPath)) {
  const exp = JSON.parse(readFileSync(expPath, "utf8")) as FixtureExpectations;
  const expErrors = evaluate(doc as AuditDoc, exp.assertions);
  for (const e of expErrors) console.log(`EXPECT ${e}`);
  if (expErrors.length) {
    console.log(`${expErrors.length} expectation failure(s) — run kept at ${runDir}`);
    process.exit(1);
  }
  console.log(`expectations: ${exp.assertions.length} assertions pass`);
}

// --- 6. cross-format agreement: the two views vs the JSON ---
const agree = checkAgreement(
  doc as AuditDoc,
  readFileSync(join(workspace, expected[1]), "utf8"),
  readFileSync(join(workspace, expected[2]), "utf8"),
);
for (const w of agree.warnings) console.log(`WARN  ${w}`);
for (const e of agree.errors) console.log(`AGREE ${e}`);
if (agree.errors.length) {
  console.log(`${agree.errors.length} agreement violation(s) — run kept at ${runDir}`);
  process.exit(1);
}
console.log("agreement: views consistent with the JSON");

console.log(`ALL CHECKS PASS — run kept at ${runDir}`);
process.exit(0);
