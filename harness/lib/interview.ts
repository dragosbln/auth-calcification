/**
 * The answers-file affordance (`_interview.yaml`).
 *
 * When the audited root carries an `_interview.yaml`, the skill reads the
 * maintainer's judgment answers from it instead of running the live
 * interview (SKILL.md Phase 2). For the harness this file is GROUND-TRUTH
 * INPUT — unlike everything else the skill produces, we know exactly what
 * went in, so the run becomes an input→output fidelity test: the JSON must
 * reproduce the answers verbatim, normalize likelihood per the documented
 * table, and honor cost_confirmed.
 *
 * LIKELIHOOD_MAPPING mirrors the table in SKILL.md Phase 2 — the harness
 * copy is what the tests assert against. If you change one, change both
 * (same discipline as lib/types.ts mirroring the schema).
 */
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { AXES } from "./types.ts";
import type { Axis } from "./types.ts";

export type Likelihood = "none" | "low" | "medium" | "high";
export type CostLevel = "low" | "moderate" | "high";

export interface InterviewFileAxis {
  answer: string;
  notes?: string;
  cost_confirmed?: CostLevel;
}

export type InterviewFile = Partial<Record<Axis, InterviewFileAxis>>;

/** SKILL.md Phase 2 mapping table, machine-readable. null = judgment calls. */
export const LIKELIHOOD_MAPPING: Record<Axis, Record<string, Likelihood | null>> = {
  storage: {
    "Yes — planned": "high",
    "Maybe — discussed": "medium",
    "No — acceptable today": "low",
    "Don't know": null,
  },
  refresh: {
    "Yes — planned": "high",
    "Tied to storage": "medium",
    "No — vendor refresh is fine": "low",
    "Don't know": null,
  },
  identity_provider: {
    "Yes — actively planned": "high",
    "Likely — being discussed": "medium",
    "Unlikely, defensive value": "low",
    "No — locked in": "none",
  },
  authorization: {
    "RBAC/ABAC or finer permissions": "high",
    "ID → access token": "high",
    "Neither — current model is fine": "low",
    "Don't know": null,
  },
};

export function loadInterviewFile(path: string): InterviewFile {
  const raw = load(readFileSync(path, "utf8"));
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("_interview.yaml is not a mapping of axes");
  }
  const file: InterviewFile = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(AXES as readonly string[]).includes(key)) {
      throw new Error(`_interview.yaml: unknown axis '${key}'`);
    }
    if (value === null || typeof value !== "object" || typeof (value as { answer?: unknown }).answer !== "string") {
      throw new Error(`_interview.yaml: axis '${key}' needs a string 'answer'`);
    }
    file[key as Axis] = value as InterviewFileAxis;
  }
  return file;
}
