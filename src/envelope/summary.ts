import type { ActionInputs, RoutedCommand } from "../types";
import {
  buildNormalizedPlanSummary,
  fingerprintNormalizedPlan,
  parsePlanJsonFile,
} from "../plan";
import {
  buildNormalizedTemplateSummary,
  fingerprintNormalizedTemplate,
  parseTemplateFile,
} from "../template";
import type { NormalizedChangeSummary } from "./types";

function summarizeTemplateArtifacts(
  inputs: ActionInputs,
  routed: RoutedCommand,
): NormalizedChangeSummary {
  const templates = routed.resolvedArtifactPaths.map((artifactPath) =>
    parseTemplateFile(artifactPath),
  );
  const normalized = buildNormalizedTemplateSummary(templates, {
    iacTool: inputs.iacTool,
    command: routed.command as "synth" | "diff" | "deploy-verification",
    artifactPaths: routed.artifactPaths,
  });
  const templateFingerprint = fingerprintNormalizedTemplate(
    normalized.templateFingerprintInput,
  );

  return {
    summaryKind: "template",
    commandCategory: routed.command,
    iacTool: inputs.iacTool,
    artifactCount: routed.resolvedArtifactPaths.length,
    resourceActionCounts: normalized.resourceActionCounts,
    resourceAddresses: normalized.resourceLogicalIds,
    providerHints: normalized.resourceTypes,
    details: {
      templateFormatVersion: normalized.templateFormatVersion,
      stackNames: normalized.stackNames,
      accountHints: normalized.accountHints,
      regionHints: normalized.regionHints,
      targetEnvironment: inputs.targetEnvironment,
      requestedAuthority: inputs.requestedAuthority,
      workingDirectory: inputs.workingDirectory,
      sensitiveResourceHints: normalized.sensitiveResourceHints,
      sourceTool: normalized.sourceTool,
      templateFingerprint,
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
