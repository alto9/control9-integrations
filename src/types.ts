export type RuntimeMode = "shadow" | "enforce";

export type IacTool = "terraform" | "opentofu" | "cdk" | "cloudformation";

export type CommandCategory = "plan" | "synth" | "diff" | "deploy-verification";

export type DecisionKind = "allow" | "deny" | "require_approval" | "observe" | "pending";

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
  status: "validated";
  message: string;
}

export interface ActionResult {
  envelopeId: string;
  artifactFingerprint: string;
  decisionId: string;
  decisionKind: DecisionKind;
  summaryPath: string;
}

export class Control9ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Control9ActionError";
  }
}
