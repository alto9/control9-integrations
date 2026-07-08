import type { CommandCategory, DecisionKind, IacTool, RuntimeMode } from "../types";

export const ENVELOPE_SCHEMA_VERSION = "control9.action-envelope.v0" as const;

export interface GitHubProviderContext {
  provider: "github";
  eventName?: string;
  apiUrl?: string;
}

export interface GitLabProviderContext {
  provider: "gitlab";
  apiUrl?: string;
}

export type ProviderContext = GitHubProviderContext | GitLabProviderContext;

export interface RunIdentity {
  runId: string;
  runAttempt: string;
  workflow: string;
  job: string;
}

export interface TenantIdentity {
  tenantId: string;
}

export interface RepositoryIdentity {
  owner: string;
  name: string;
  fullName: string;
}

export interface RefOrPullRequestIdentity {
  ref: string;
  sha: string;
  pullRequestNumber?: number;
}

export interface ActorIdentity {
  login: string;
  actorType: string;
}

export interface RedactionMarker {
  marker: string;
  valueClass: string;
  count: number;
}

export interface RedactionReport {
  profile: string;
  markers: RedactionMarker[];
  totalRedactions: number;
}

export interface ArtifactFingerprintEntry {
  path: string;
  fingerprint: string;
}

export interface SignatureMetadata {
  algorithm: "hmac-sha256";
  keyId: string;
  signature: string;
  signedAt: string;
}

export interface NormalizedChangeSummary {
  summaryKind: "generic" | "terraform-plan" | "template";
  commandCategory: CommandCategory;
  iacTool: IacTool;
  artifactCount: number;
  resourceActionCounts?: Record<string, number>;
  resourceAddresses?: string[];
  providerHints?: string[];
  details?: Record<string, unknown>;
}

export interface UnsignedActionEnvelope {
  schemaVersion: typeof ENVELOPE_SCHEMA_VERSION;
  envelopeId: string;
  correlationId: string;
  providerContext: ProviderContext;
  runIdentity: RunIdentity;
  tenantIdentity: TenantIdentity;
  repositoryIdentity: RepositoryIdentity;
  refOrPullRequestIdentity: RefOrPullRequestIdentity;
  actorIdentity: ActorIdentity;
  commandCategory: CommandCategory;
  iacTool: IacTool;
  environment: string;
  requestedAuthority: string;
  runtimeMode: RuntimeMode;
  normalizedChangeSummary: NormalizedChangeSummary;
  redactionReport: RedactionReport;
  artifactFingerprints: ArtifactFingerprintEntry[];
}

export interface ActionEnvelope extends UnsignedActionEnvelope {
  signature: SignatureMetadata;
}

export interface WorkflowContext {
  providerContext: ProviderContext;
  runIdentity: RunIdentity;
  repositoryIdentity: RepositoryIdentity;
  refOrPullRequestIdentity: RefOrPullRequestIdentity;
  actorIdentity: ActorIdentity;
  correlationId: string;
}

/** @deprecated Use {@link WorkflowContext} */
export type GitHubWorkflowContext = WorkflowContext;

export interface PolicyDecision {
  decisionId: string;
  decisionKind: Exclude<DecisionKind, "pending">;
  reason: string;
  riskSummary?: string;
  policyVersion?: string;
  followUp?: Record<string, unknown>;
}

export interface RawPolicyDecisionResponse {
  decision_id?: string;
  decisionId?: string;
  decision_kind?: string;
  decisionKind?: string;
  reason?: string;
  correlation_id?: string;
  correlationId?: string;
  risk_summary?: string;
  riskSummary?: string;
  policy_version?: string;
  policyVersion?: string;
  follow_up?: Record<string, unknown>;
  followUp?: Record<string, unknown>;
}
