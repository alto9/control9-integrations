import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ActionEnvelope, PolicyDecision } from "./envelope/types";
import type { ActionInputs, ActionResult, RoutedCommand, ValidationSummary } from "./types";

export function buildValidationSummary(
  inputs: ActionInputs,
  routed: RoutedCommand,
  artifactFingerprint: string,
  envelope: ActionEnvelope,
  decision: PolicyDecision,
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
    decisionId: decision.decisionId,
    decisionKind: decision.decisionKind,
    decisionReason: decision.reason,
    redactionCount: envelope.redactionReport.totalRedactions,
    status: "submitted",
    message: decision.reason,
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
  decision: PolicyDecision,
): ActionResult {
  return {
    envelopeId: envelope.envelopeId,
    artifactFingerprint,
    decisionId: decision.decisionId,
    decisionKind: decision.decisionKind,
    summaryPath,
  };
}
