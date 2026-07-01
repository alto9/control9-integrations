export type RuntimeMode = "shadow" | "enforce";

export type IacTool = "terraform" | "opentofu" | "cdk" | "cloudformation";

export type CommandCategory = "plan" | "synth" | "diff" | "deploy-verification";

export type DecisionKind = "allow" | "deny" | "require_approval" | "observe" | "pending";

export type FailureDecisionKind = "unavailable_api" | "timeout" | "malformed_response";

export type VerificationStatus = "verified" | "fingerprint_mismatch" | "no_approved_baseline";

export type OutputDecisionKind = Exclude<DecisionKind, "pending"> | FailureDecisionKind;

export type OutputVerificationStatus = VerificationStatus | FailureDecisionKind;

export interface ActionInputs {
  mode: RuntimeMode;
  control9ApiUrl: string;
  tenantId: string;
  signingSecret: string;
  targetEnvironment: string;
  requestedAuthority: string;
  iacTool: IacTool;
  command: CommandCategory;
  artifactPaths: string[];
  workingDirectory: string;
  redactionProfile?: string;
  redactionAdditionalPatterns: string[];
  failOpenEnvironments: string[];
}

export interface RoutedCommand {
  iacTool: IacTool;
  command: CommandCategory;
  artifactPaths: string[];
  resolvedArtifactPaths: string[];
}

export interface ValidationSummary {
  mode: RuntimeMode;
  tenantId: string;
  targetEnvironment: string;
  requestedAuthority: string;
  iacTool: IacTool;
  command: CommandCategory;
  artifactFingerprint: string;
  artifactPaths: string[];
  redactionProfile: string;
  envelopeId: string;
  correlationId: string;
  decisionId: string;
  decisionKind: OutputDecisionKind | "";
  decisionReason: string;
  verificationId: string;
  verificationStatus: OutputVerificationStatus | "";
  redactionCount: number;
  status: "submitted" | "submission_failed";
  message: string;
}

export interface ActionResult {
  envelopeId: string;
  artifactFingerprint: string;
  decisionId: string;
  decisionKind: OutputDecisionKind | "";
  verificationId: string;
  verificationStatus: OutputVerificationStatus | "";
  summaryPath: string;
}

export class Control9ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Control9ActionError";
  }
}
