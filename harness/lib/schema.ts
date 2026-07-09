/**
 * Layer 1 — SHAPE validation.
 *
 * Validates a candidate audit document against the skill's own
 * assets/audit-schema.json using ajv (JSON Schema draft 2020-12). The schema
 * is read from the skill package directly — never copied into the harness —
 * so the schema the tests enforce is byte-for-byte the schema that ships.
 *
 * This layer answers "is this a well-formed audit document at all?":
 * required fields, closed enums, the presence/absence discriminated union,
 * conditional note requirements on the escape hatches, no undeclared
 * properties. What it structurally CANNOT check — references resolving,
 * quotes matching real files, cross-field implications — is layer 2
 * (lib/invariants.ts), which is allowed to assume layer 1 passed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv/dist/2020.js";

const SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../skill/auth-calcification-audit/skills/auth-calcification-audit/assets/audit-schema.json",
);

function formatError(e: ErrorObject): string {
  const where = e.instancePath || "/";
  const allowed =
    e.keyword === "enum" && Array.isArray((e.params as { allowedValues?: unknown[] }).allowedValues)
      ? ` (allowed: ${(e.params as { allowedValues: unknown[] }).allowedValues.join(", ")})`
      : "";
  return `${where}: ${e.message}${allowed}`;
}

/** Returns [] when the document conforms; otherwise one message per violation. */
export function validateShape(doc: unknown): string[] {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
  const validate = ajv.compile(schema);
  if (validate(doc)) return [];
  return (validate.errors ?? []).map(formatError);
}
