import type { PolicyDecision, RedactionReport } from "../envelope/types";
import type { RuntimeMode } from "../types";

export type PolicyDecisionOutcomeKind = "allow" | "deny" | "require_approval" | "observe";

export type VerificationOutcomeKind =
  | "verified"
  | "fingerprint_mismatch"
  | "no_approved_baseline";

export type ErrorOutcomeKind =
  | "timeout"
  | "unavailable_api"
  | "malformed_response"
  | "redaction_applied";

export type RenderOutcomeKind =
  | PolicyDecisionOutcomeKind
  | VerificationOutcomeKind
  | ErrorOutcomeKind;

export interface PolicyDecisionRenderInput {
  kind: "policy_decision";
  decision: PolicyDecision;
  artifactFingerprint?: string;
  targetEnvironment?: string;
  redactionReport?: RedactionReport;
  runtimeMode?: RuntimeMode;
}

export interface TimeoutRenderInput {
  kind: "timeout";
  artifactFingerprint?: string;
  targetEnvironment?: string;
  runtimeMode?: RuntimeMode;
  failOpenEnvironments?: string[];
}

export interface UnavailableApiRenderInput {
  kind: "unavailable_api";
  artifactFingerprint?: string;
  targetEnvironment?: string;
  runtimeMode?: RuntimeMode;
  failOpenEnvironments?: string[];
}

export interface MalformedResponseRenderInput {
  kind: "malformed_response";
  artifactFingerprint?: string;
  targetEnvironment?: string;
  detail?: string;
  runtimeMode?: RuntimeMode;
}

export interface RedactionAppliedRenderInput {
  kind: "redaction_applied";
  redactionReport: RedactionReport;
  artifactFingerprint?: string;
  targetEnvironment?: string;
}

export interface FingerprintMismatchRenderInput {
  kind: "fingerprint_mismatch";
  expectedFingerprint?: string;
  actualFingerprint?: string;
  targetEnvironment?: string;
  runtimeMode?: RuntimeMode;
}

export interface VerifiedRenderInput {
  kind: "verified";
  verificationId: string;
  decisionId?: string;
  artifactFingerprint?: string;
  targetEnvironment?: string;
  runtimeMode?: RuntimeMode;
}

export interface NoApprovedBaselineRenderInput {
  kind: "no_approved_baseline";
  verificationId: string;
  reason: string;
  decisionId?: string;
  artifactFingerprint?: string;
  targetEnvironment?: string;
  runtimeMode?: RuntimeMode;
}

export type DecisionRenderInput =
  | PolicyDecisionRenderInput
  | TimeoutRenderInput
  | UnavailableApiRenderInput
  | MalformedResponseRenderInput
  | RedactionAppliedRenderInput
  | FingerprintMismatchRenderInput
  | VerifiedRenderInput
  | NoApprovedBaselineRenderInput;

export interface RenderedDecisionMetadata {
  decisionId?: string;
  verificationId?: string;
  policyVersion?: string;
  artifactFingerprint?: string;
  targetEnvironment?: string;
  redactionStatus?: string;
  followUpAction?: string;
  expectedFingerprint?: string;
  actualFingerprint?: string;
}

export interface RenderedDecisionFeedback {
  outcomeKind: RenderOutcomeKind;
  label: string;
  title: string;
  summary: string;
  detailLines: string[];
  bodyMarkdown: string;
  annotationMessage: string;
  isAdvisory: boolean;
  blocksWorkflow: boolean;
  metadata: RenderedDecisionMetadata;
}
