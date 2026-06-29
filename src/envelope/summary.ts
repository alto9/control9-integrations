import type { ActionInputs, RoutedCommand } from "../types";
import {
  buildNormalizedPlanSummary,
  fingerprintNormalizedPlan,
  parsePlanJsonFile,
} from "../plan";
import type { NormalizedChangeSummary } from "./types";

function summarizeTemplateArtifacts(
  inputs: ActionInputs,
  routed: RoutedCommand,
): NormalizedChangeSummary {
  return {
    summaryKind: "template",
    commandCategory: routed.command,
    iacTool: routed.iacTool,
    artifactCount: routed.resolvedArtifactPaths.length,
    details: {
      artifactPaths: routed.artifactPaths,
      workingDirectory: inputs.workingDirectory,
    },
  };
}

function summarizeGeneric(
  inputs: ActionInputs,
  routed: RoutedCommand,
): NormalizedChangeSummary {
  return {
    summaryKind: "generic",
    commandCategory: routed.command,
    iacTool: routed.iacTool,
    artifactCount: routed.resolvedArtifactPaths.length,
    details: {
      artifactPaths: routed.artifactPaths,
      workingDirectory: inputs.workingDirectory,
    },
  };
}

function summarizePlanArtifacts(
  inputs: ActionInputs,
  routed: RoutedCommand,
): NormalizedChangeSummary {
  const planPath = routed.resolvedArtifactPaths[0];
  const plan = parsePlanJsonFile(planPath);
  const normalized = buildNormalizedPlanSummary(plan, {
    workingDirectory: inputs.workingDirectory,
    iacTool: inputs.iacTool,
  });
  const planFingerprint = fingerprintNormalizedPlan(normalized.planFingerprintInput);

  return {
    summaryKind: "terraform-plan",
    commandCategory: routed.command,
    iacTool: inputs.iacTool,
    artifactCount: routed.resolvedArtifactPaths.length,
    resourceActionCounts: normalized.resourceActionCounts,
    resourceAddresses: normalized.resourceAddresses,
    providerHints: normalized.providerHints,
    details: {
      formatVersion: normalized.formatVersion,
      targetWorkspace: normalized.targetWorkspace,
      targetEnvironment: inputs.targetEnvironment,
      requestedAuthority: inputs.requestedAuthority,
      workingDirectory: inputs.workingDirectory,
      sensitiveResourceHints: normalized.sensitiveResourceHints,
      planFingerprint,
    },
  };
}

export function buildNormalizedChangeSummary(
  inputs: ActionInputs,
  routed: RoutedCommand,
): NormalizedChangeSummary {
  if (
    (inputs.iacTool === "terraform" || inputs.iacTool === "opentofu") &&
    (routed.command === "plan" || routed.command === "deploy-verification")
  ) {
    return summarizePlanArtifacts(inputs, routed);
  }

  if (inputs.iacTool === "cdk" || inputs.iacTool === "cloudformation") {
    return summarizeTemplateArtifacts(inputs, routed);
  }

  return summarizeGeneric(inputs, routed);
}
