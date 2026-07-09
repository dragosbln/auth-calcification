/**
 * Layer 3 — fixture EXPECTATIONS (ground truth).
 *
 * Layers 1–2 prove an audit document is internally honest (well-formed,
 * evidence-backed, non-fabricated). They cannot know what the CORRECT answer
 * for a given codebase is. This layer can, because fixtures are designed:
 * each expectations/<fixture>.json declares what any competent run on that
 * fixture must conclude — must-detect and must-not-claim, expressed as
 * assertions over the audit JSON.
 *
 * Vocabulary (one object per assertion; `path` is a dot-path into the doc):
 *   equals     — deep equality with the given value
 *   oneOf      — value is one of the given set (tolerance for legitimate
 *                judgment variance, e.g. b2 ∈ {present, partial})
 *   isNull     — value is null (true) / non-null (false)
 *   length     — array has exactly n elements
 *   minLength  — array has at least n elements
 *   some       — array has ≥1 element whose fields subset-match the pattern
 *
 * Path templates: vendor ids are MODEL-CHOSEN and unstable across runs, so
 * paths never hardcode them. `<v>` resolves to the first profiled vendor's
 * id; `<v:auth0.md>` resolves to the id of the vendor whose profile is that
 * filename (profiles are stable — they ship with the skill).
 *
 * Deliberately NOT in v1: finding-count assertions. Models consolidate or
 * split findings run-to-run (one leak finding with three anchors vs three
 * findings); counting them fences against consolidation style, not against
 * detection quality. The enums are the recall test.
 */
import type { AuditDoc } from "./types.ts";

export interface Assertion {
  path: string;
  equals?: unknown;
  oneOf?: unknown[];
  isNull?: boolean;
  length?: number;
  minLength?: number;
  /** array has ≥1 element matching: object pattern = subset match on fields; primitive = deep equality */
  some?: unknown;
  /** human context, printed on failure */
  note?: string;
}

export interface FixtureExpectations {
  fixture: string;
  assertions: Assertion[];
}

export interface EqualitySpec {
  type: "structural_equality";
  description?: string;
  fixtures: [string, string];
  paths: string[];
}

export type ExpectationFile = FixtureExpectations | EqualitySpec;

export function isEqualitySpec(e: ExpectationFile): e is EqualitySpec {
  return (e as EqualitySpec).type === "structural_equality";
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function subsetMatch(item: unknown, pattern: unknown): boolean {
  if (pattern === null || typeof pattern !== "object") return deepEqual(item, pattern);
  if (item === null || typeof item !== "object") return false;
  return Object.entries(pattern as Record<string, unknown>).every(([k, v]) =>
    deepEqual((item as Record<string, unknown>)[k], v),
  );
}

function vendorId(doc: AuditDoc, profile?: string): string {
  const v = profile
    ? doc.vendors.find((x) => x.profile === profile)
    : doc.vendors.find((x) => x.profile !== null);
  if (!v) throw new Error(`no vendor resolves <v${profile ? `:${profile}` : ""}>`);
  return v.id;
}

/** Resolve a path template against a document (substituting <v…> markers). */
export function resolvePath(doc: AuditDoc, template: string): unknown {
  const path = template.replace(/<v(?::([^>]+))?>/g, (_m, profile: string | undefined) => vendorId(doc, profile));
  let cur: unknown = doc;
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

const fmt = (v: unknown): string => (v === undefined ? "undefined" : JSON.stringify(v));

/** Returns [] when all assertions hold; otherwise one message per failure. */
export function evaluate(doc: AuditDoc, assertions: Assertion[]): string[] {
  const errors: string[] = [];
  for (const a of assertions) {
    let value: unknown;
    try {
      value = resolvePath(doc, a.path);
    } catch (e) {
      errors.push(`${a.path}: ${(e as Error).message}`);
      continue;
    }
    const fail = (msg: string) => void errors.push(`${a.path}: ${msg}${a.note ? ` — ${a.note}` : ""}`);

    if ("equals" in a && !deepEqual(value, a.equals)) fail(`expected ${fmt(a.equals)}, got ${fmt(value)}`);
    if (a.oneOf && !a.oneOf.some((o) => deepEqual(value, o))) fail(`expected one of ${fmt(a.oneOf)}, got ${fmt(value)}`);
    if (a.isNull !== undefined && (value === null) !== a.isNull) {
      fail(`expected ${a.isNull ? "null" : "non-null"}, got ${fmt(value)}`);
    }
    if (a.length !== undefined && (!Array.isArray(value) || value.length !== a.length)) {
      fail(`expected array of length ${a.length}, got ${Array.isArray(value) ? value.length : fmt(value)}`);
    }
    if (a.minLength !== undefined && (!Array.isArray(value) || value.length < a.minLength)) {
      fail(`expected array of length >= ${a.minLength}, got ${Array.isArray(value) ? value.length : fmt(value)}`);
    }
    if (a.some !== undefined && (!Array.isArray(value) || !value.some((item) => subsetMatch(item, a.some)))) {
      fail(`no element matching ${fmt(a.some)}`);
    }
  }
  return errors;
}

/** Compare path templates across two documents (each resolves <v…> itself). */
export function evaluateEquality(spec: EqualitySpec, docs: Record<string, AuditDoc>): string[] {
  const [a, b] = spec.fixtures;
  const errors: string[] = [];
  for (const p of spec.paths) {
    const va = resolvePath(docs[a], p);
    const vb = resolvePath(docs[b], p);
    if (!deepEqual(va, vb)) errors.push(`${p}: ${a}=${fmt(va)} vs ${b}=${fmt(vb)}`);
  }
  return errors;
}
