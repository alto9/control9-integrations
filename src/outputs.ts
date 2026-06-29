import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ActionInputs, ActionResult, RoutedCommand, ValidationSummary } from "./types";

export function buildValidationSummary(
  inputs: ActionInputs,
  routed: RoutedCommand,
  artifactFingerprint: string,
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
    status: "validated",
    message:
      "Inputs validated and artifacts routed locally. Envelope construction and policy submission are implemented in later milestones.",
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

export function buildBootstrapResult(
  summaryPath: string,
  artifactFingerprint: string,
  mode: ActionInputs["mode"],
): ActionResult {
  return {
    envelopeId: "",
    artifactFingerprint,
    decisionId: "",
    decisionKind: mode === "shadow" ? "observe" : "pending",
    summaryPath,
  };
}
