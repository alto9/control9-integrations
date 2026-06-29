import type { IacTool } from "../types";
import {
  type NormalizedPlanFingerprintInput,
  type NormalizedPlanSummary,
  type NormalizedResourceAction,
  type TerraformPlanJson,
  type TerraformPlanResourceChange,
} from "./types";

const IAM_RESOURCE_TYPES = new Set([
  "aws_iam_role",
  "aws_iam_policy",
  "aws_iam_role_policy",
  "aws_iam_role_policy_attachment",
  "aws_iam_user",
  "aws_iam_user_policy",
  "aws_iam_group",
  "aws_iam_group_policy",
  "aws_iam_instance_profile",
  "aws_iam_access_key",
  "google_project_iam_member",
  "google_service_account",
  "azurerm_role_assignment",
]);

function emptyActionCounts(): Record<NormalizedResourceAction, number> {
  return {
    create: 0,
    update: 0,
    delete: 0,
    replace: 0,
    "no-op": 0,
  };
}

export function normalizeResourceAction(actions: string[]): NormalizedResourceAction {
  const normalized = [...actions].sort();
  if (normalized.length === 1) {
    const action = normalized[0];
    if (
      action === "create" ||
      action === "update" ||
      action === "delete" ||
      action === "no-op"
    ) {
      return action;
    }
  }

  if (
    normalized.length === 2 &&
    normalized.includes("create") &&
    normalized.includes("delete")
  ) {
    return "replace";
  }

  return "update";
}

export function countResourceActions(
  resourceChanges: TerraformPlanResourceChange[],
): Record<NormalizedResourceAction, number> {
  const counts = emptyActionCounts();
  for (const change of resourceChanges) {
    const action = normalizeResourceAction(change.change?.actions ?? []);
    counts[action] += 1;
  }
  return counts;
}

function collectSensitiveResourceHints(
  resourceChanges: TerraformPlanResourceChange[],
): string[] {
  const hints = new Set<string>();
  for (const change of resourceChanges) {
    const resourceType = change.type;
    if (resourceType && IAM_RESOURCE_TYPES.has(resourceType)) {
      hints.add(resourceType);
    }
    if (change.address?.includes("iam")) {
      hints.add(change.address);
    }
  }
  return [...hints].sort();
}

function resolveTargetWorkspace(
  plan: TerraformPlanJson,
  workingDirectory: string,
): string | undefined {
  const workspaceName = (plan as TerraformPlanJson & { workspace?: { name?: string } })
    .workspace?.name;
  if (typeof workspaceName === "string" && workspaceName.trim().length > 0) {
    return workspaceName;
  }

  if (workingDirectory.trim().length > 0 && workingDirectory !== ".") {
    return workingDirectory;
  }

  return undefined;
}

export function buildNormalizedPlanSummary(
  plan: TerraformPlanJson,
  options: {
    workingDirectory: string;
    iacTool: IacTool;
  },
): NormalizedPlanSummary {
  const resourceChanges = plan.resource_changes ?? [];
  const resourceActionCounts = countResourceActions(resourceChanges);
  const resourceAddresses = resourceChanges
    .map((change) => change.address)
    .filter((address): address is string => Boolean(address))
    .sort();
  const providerHints = [
    ...new Set(
      resourceChanges
        .map((change) => change.provider_name)
        .filter((provider): provider is string => Boolean(provider)),
    ),
  ].sort();
  const sensitiveResourceHints = collectSensitiveResourceHints(resourceChanges);
  const formatVersion = plan.format_version ?? "unknown";

  const planFingerprintInput: NormalizedPlanFingerprintInput = {
    formatVersion,
    resourceActionCounts,
    resourceAddresses,
    providerHints,
    sensitiveResourceHints,
  };

  return {
    resourceActionCounts,
    resourceAddresses,
    providerHints,
    sensitiveResourceHints,
    targetWorkspace: resolveTargetWorkspace(plan, options.workingDirectory),
    formatVersion,
    planFingerprintInput,
  };
}
