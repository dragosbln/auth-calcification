#!/usr/bin/env node
/**
 * Version-sync lint: the skill's version is declared in three places that
 * must never drift — plugin.json (the package), marketplace.json (the
 * listing), and SKILL.md frontmatter (what the model can actually read at
 * run time, and therefore the source of meta.skill_version in the output).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const pluginJson = JSON.parse(
  readFileSync(join(REPO, "skill/auth-calcification-audit/.claude-plugin/plugin.json"), "utf8"),
) as { version: string };

const marketplace = JSON.parse(readFileSync(join(REPO, ".claude-plugin/marketplace.json"), "utf8")) as {
  plugins: Array<{ version: string }>;
};

const skillMd = readFileSync(
  join(REPO, "skill/auth-calcification-audit/skills/auth-calcification-audit/SKILL.md"),
  "utf8",
);
const fm = skillMd.match(/^---\n([\s\S]*?)\n---/);
const skillVersion = fm?.[1].match(/^version:\s*(\S+)\s*$/m)?.[1];

const versions = {
  "plugin.json": pluginJson.version,
  "marketplace.json": marketplace.plugins[0].version,
  "SKILL.md frontmatter": skillVersion ?? "(missing)",
};

const distinct = new Set(Object.values(versions));
if (distinct.size !== 1) {
  for (const [where, v] of Object.entries(versions)) console.log(`ERROR version in ${where}: ${v}`);
  process.exit(1);
}
console.log(`versions in sync: ${[...distinct][0]}`);
