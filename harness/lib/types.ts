/**
 * Shared TypeScript shape of the audit document.
 *
 * Mirrors the skill's assets/audit-schema.json. The JSON Schema is the
 * canonical contract (it ships with the skill and drives generation); these
 * types are the harness-side mirror so the checker code is type-safe. If the
 * two drift, `npm run check` fails at runtime on real documents — the schema
 * wins, update this file.
 */

export const AXES = ["storage", "refresh", "identity_provider", "authorization"] as const;
export type Axis = (typeof AXES)[number];

export interface EvidenceAnchor {
  file: string;
  line: number;
  quote: string;
}

export interface Finding {
  id: string;
  vendor: string | null;
  claim: "presence" | "absence";
  statement: string;
  note?: string;
  /** presence claims only */
  evidence?: EvidenceAnchor[];
  /** absence claims only */
  checked_patterns?: string[];
  searched?: string[];
  /** absence claims only (schema >= 1.2): verifiable anchors that contextualize the absence */
  context_evidence?: EvidenceAnchor[];
}

export interface SignalAssessment {
  status: "present" | "partial" | "absent" | "not_applicable" | "undetermined";
  finding_ids: string[];
  note?: string;
}

export interface AxisPerVendor {
  classification?: string;
  claims_handling?: string;
  api_token_type?: string;
  finding_ids: string[];
  note?: string;
}

export interface CostEvidence {
  level: "low" | "moderate" | "high";
  basis: string;
  finding_ids?: string[];
}

export interface AxisAssessment {
  per_vendor: Record<string, AxisPerVendor>;
  recommended_seam: string;
  likelihood: "none" | "low" | "medium" | "high" | null;
  cost_evidence: CostEvidence;
  cost_confirmed?: "low" | "moderate" | "high" | null;
}

export interface Vendor {
  id: string;
  detected: string;
  sdk_version?: string;
  profile: string | null;
  profile_verified?: string;
}

export interface Coverage {
  comprehensive: Array<{ path: string; reason: string }>;
  sampled: Array<{ path: string; note?: string }>;
  gaps: Array<{ reason: string; path?: string; vendor?: string }>;
}

export interface Interview {
  source: "live" | "file";
  answers: Partial<Record<Axis, { answer: string; notes?: string }>>;
}

export interface JudgmentCall {
  axis: Axis | null;
  question: string;
  context?: string;
  finding_ids?: string[];
}

export interface BacklogItem {
  task: string;
  axes: Axis[];
  why: string;
  finding_ids: string[];
  scope_paths?: string[];
}

export interface MigrationReadinessItem {
  axis: Axis;
  change: string;
  progress: "minimal" | "partial" | "substantial" | "nearly_complete";
  remaining: string[];
  finding_ids?: string[];
}

export interface AuditDoc {
  schema_version: string;
  meta: {
    scope: string;
    date: string;
    skill_version: string;
    model_self_reported: string;
    disclaimer_fired: boolean;
    mode: "interactive" | "non-interactive";
  };
  vendors: Vendor[];
  coverage: Coverage;
  findings: Finding[];
  boundary: Record<string, Record<string, SignalAssessment>>;
  axes: Record<Axis, AxisAssessment>;
  interview: Interview | null;
  judgment_calls: JudgmentCall[];
  backlog: BacklogItem[] | null;
  migration_readiness: MigrationReadinessItem[] | null;
  synthesis: {
    posture: string;
    headline: { text: string; finding_ids: string[] };
  };
}
