import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ActionEnvelope, PolicyDecision } from "./envelope/types";
import type { PolicySubmissionResult } from "./policy/submission";
import type { DeployVerification } from "./verification/types";
import type { VerificationSubmissionResult } from "./verification/submission";
import type {
  ActionInputs,
  ActionResult,
  OutputDecisionKind,
  OutputVerificationStatus,
  RoutedCommand,
  ValidationSummary,
} from "./types";

export function buildValidationSummary(
  inputs: ActionInputs,
  routed: RoutedCommand,
  artifactFingerprint: string,
  envelope: ActionEnvelope,
  decision: PolicyDecision,
  options?: { correlationId?: string },
): ValidationSummary {
  return {
    mode: inputs.mode,
    tenantId: inputs.tenantId,
    targetEnvironment: inputs.targetEnvironment,
    requestedAuthority: inputs.requestedAuthority,
    iacTool: routed.iacTool,
    command: routed.command,
    artifactFingerprint,
    artifactPaths: routed.artifactPaths,
    redactionProfile: inputs.redactionProfile ?? "standard",
    envelopeId: envelope.envelopeId,
    correlationId: options?.correlationId ?? envelope.correlationId,
    decisionId: decision.decisionId,
    decisionKind: decision.decisionKind,
    decisionReason: decision.reason,
    verificationId: "",
    verificationStatus: "",
    redactionCount: envelope.redactionReport.totalRedactions,
    status: "submitted",
    message: decision.reason,
  };
}

export function buildFailureValidationSummary(
  inputs: ActionInputs,
  routed: RoutedCommand,
  artifactFingerprint: string,
  envelope: ActionEnvelope,
  submission: Extract<PolicySubmissionResult, { status: "failure" }>,
  summaryMessage: string,
): ValidationSummary {
  return {
    mode: inputs.mode,
    tenantId: inputs.tenantId,
    targetEnvironment: inputs.targetEnvironment,
    requestedAuthority: inputs.requestedAuthority,
    iacTool: routed.iacTool,
    command: routed.command,
    artifactFingerprint,
    artifactPaths: routed.artifactPaths,
    redactionProfile: inputs.redactionProfile ?? "standard",
    envelopeId: envelope.envelopeId,
    correlationId: envelope.correlationId,
    decisionId: "",
    decisionKind: submission.failureKind,
    decisionReason: summaryMessage,
    verificationId: "",
    verificationStatus: "",
    redactionCount: envelope.redactionReport.totalRedactions,
    status: "submission_failed",
    message: summaryMessage,
  };
}

export function buildVerificationValidationSummary(
  inputs: ActionInputs,
  routed: RoutedCommand,
  artifactFingerprint: string,
  envelope: ActionEnvelope,
  verification: DeployVerification,
): ValidationSummary {
  return {
    mode: inputs.mode,
    tenantId: inputs.tenantId,
    targetEnvironment: inputs.targetEnvironment,
    requestedAuthority: inputs.requestedAuthority,
    iacTool: routed.iacTool,
    command: routed.command,
    artifactFingerprint,
    artifactPaths: routed.artifactPaths,
    redactionProfile: inputs.redactionProfile ?? "standard",
    envelopeId: envelope.envelopeId,
    correlationId: envelope.correlationId,
    decisionId: verification.decisionId ?? "",
    decisionKind: "",
    decisionReason: verification.reason ?? "",
    verificationId: verification.verificationId,
    verificationStatus: verification.verificationStatus,
    redactionCount: envelope.redactionReport.totalRedactions,
    status: "submitted",
    message: verification.reason ?? verification.verificationStatus,
  };
}

export function buildVerificationFailureValidationSummary(
  inputs: ActionInputs,
  routed: RoutedCommand,
  artifactFingerprint: string,
  envelope: ActionEnvelope,
  submission: Extract<VerificationSubmissionResult, { status: "failure" }>,
  summaryMessage: string,
): ValidationSummary {
  return {
    mode: inputs.mode,
    tenantId: inputs.tenantId,
    targetEnvironment: inputs.targetEnvironment,
    requestedAuthority: inputs.requestedAuthority,
    iacTool: routed.iacTool,
    command: routed.command,
    artifactFingerprint,
    artifactPaths: routed.artifactPaths,
    redactionProfile: inputs.redactionProfile ?? "standard",
    envelopeId: envelope.envelopeId,
    correlationId: envelope.correlationId,
    decisionId: "",
    decisionKind: "",
    decisionReason: summaryMessage,
    verificationId: "",
    verificationStatus: submission.failureKind,
    redactionCount: envelope.redactionReport.totalRedactions,
    status: "submission_failed",
    message: summaryMessage,
  };
}

export function writeSummaryFile(summary: ValidationSummary): string {
  const outputDirectory =
    process.env.RUNNER_TEMP?.trim() ||
    path.join(process.cwd(), ".control9", "output");
  mkdirSync(outputDirectory, { recursive: true });

  const summaryPath = path.join(outputDirectory, "control9-summary.json");
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summaryPath;
}

export function buildActionResult(
  summaryPath: string,
  artifactFingerprint: string,
  envelope: ActionEnvelope,
  options: {
    decisionKind?: OutputDecisionKind | "";
    decisionId?: string;
    verificationId?: string;
    verificationStatus?: OutputVerificationStatus | "";
  },
): ActionResult {
  return {
    envelopeId: envelope.envelopeId,
    artifactFingerprint,
    decisionId: options.decisionId ?? "",
    decisionKind: options.decisionKind ?? "",
    verificationId: options.verificationId ?? "",
    verificationStatus: options.verificationStatus ?? "",
    summaryPath,
  };
}
