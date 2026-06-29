import { readFileSync } from "node:fs";
import path from "node:path";

import type { ActionInputs, RoutedCommand } from "../types";
import type { NormalizedChangeSummary } from "./types";

interface TerraformPlanShape {
  resource_changes?: Array<{
    address?: string;
    provider_name?: string;
    change?: {
      actions?: string[];
    };
  }>;
}

function countResourceActions(plan: TerraformPlanShape): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const change of plan.resource_changes ?? []) {
    for (const action of change.change?.actions ?? []) {
      counts[action] = (counts[action] ?? 0) + 1;
    }
  }
  return counts;
}

function summarizeTerraformPlan(resolvedArtifactPaths: string[]): NormalizedChangeSummary {
  const planPath = resolvedArtifactPaths[0];
  const parsed = JSON.parse(readFileSync(planPath, "utf8")) as TerraformPlanShape;
  const resourceActionCounts = countResourceActions(parsed);
  const resourceAddresses = (parsed.resource_changes ?? [])
    .map((change) => change.address)
    .filter((address): address is string => Boolean(address))
    .sort();
  const providerHints = [
    ...new Set(
      (parsed.resource_changes ?? [])
        .map((change) => change.provider_name)
        .filter((provider): provider is string => Boolean(provider)),
    ),
  ].sort();

  return {
    summaryKind: "terraform-plan",
    commandCategory: "plan",
    iacTool: "terraform",
    artifactCount: resolvedArtifactPaths.length,
    resourceActionCounts,
    resourceAddresses,
    providerHints,
    details: {
      planFingerprintInput: path.basename(planPath),
    },
  };
}

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

export function buildNormalizedChangeSummary(
  inputs: ActionInputs,
  routed: RoutedCommand,
): NormalizedChangeSummary {
  if (
    (inputs.iacTool === "terraform" || inputs.iacTool === "opentofu") &&
    (routed.command === "plan" || routed.command === "deploy-verification")
  ) {
    const summary = summarizeTerraformPlan(routed.resolvedArtifactPaths);
    return {
      ...summary,
      iacTool: inputs.iacTool,
      commandCategory: routed.command,
    };
  }

  if (inputs.iacTool === "cdk" || inputs.iacTool === "cloudformation") {
    return summarizeTemplateArtifacts(inputs, routed);
  }

  return summarizeGeneric(inputs, routed);
}
