import path from "node:path";

import type { IacTool } from "../types";
import type { NormalizedResourceAction } from "../plan/types";
import { Control9ActionError } from "../types";
import type {
  CloudFormationResource,
  CloudFormationTemplate,
  NormalizedTemplateFingerprintInput,
  NormalizedTemplateSummary,
} from "./types";

const IAM_RESOURCE_TYPES = new Set([
  "AWS::IAM::Role",
  "AWS::IAM::Policy",
  "AWS::IAM::User",
  "AWS::IAM::Group",
  "AWS::IAM::ManagedPolicy",
  "AWS::IAM::AccessKey",
  "AWS::IAM::InstanceProfile",
  "AWS::IAM::RolePolicy",
  "AWS::IAM::UserPolicy",
  "AWS::IAM::GroupPolicy",
]);

const NETWORKING_RESOURCE_TYPES = new Set([
  "AWS::EC2::VPC",
  "AWS::EC2::Subnet",
  "AWS::EC2::SecurityGroup",
  "AWS::EC2::NetworkAcl",
  "AWS::EC2::RouteTable",
  "AWS::EC2::InternetGateway",
  "AWS::EC2::NatGateway",
  "AWS::EC2::VPCEndpoint",
  "AWS::EC2::VPCPeeringConnection",
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

function resourceEntries(
  template: CloudFormationTemplate,
): Array<[string, CloudFormationResource]> {
  const resources = template.Resources ?? {};
  return Object.entries(resources).sort(([left], [right]) => left.localeCompare(right));
}

function collectResourceTypes(
  entries: Array<[string, CloudFormationResource]>,
): string[] {
  return [
    ...new Set(
      entries
        .map(([, resource]) => resource.Type)
        .filter((type): type is string => Boolean(type)),
    ),
  ].sort();
}

function collectSensitiveResourceHints(
  entries: Array<[string, CloudFormationResource]>,
): string[] {
  const hints = new Set<string>();
  for (const [logicalId, resource] of entries) {
    const resourceType = resource.Type;
    if (!resourceType) {
      continue;
    }
    if (IAM_RESOURCE_TYPES.has(resourceType)) {
      hints.add(resourceType);
      hints.add(logicalId);
    }
    if (NETWORKING_RESOURCE_TYPES.has(resourceType)) {
      hints.add(resourceType);
      hints.add(logicalId);
    }
    if (resourceType.includes("::IAM::") || logicalId.toLowerCase().includes("iam")) {
      hints.add(resourceType);
      hints.add(logicalId);
    }
  }
  return [...hints].sort();
}

function extractStackNames(
  template: CloudFormationTemplate,
  artifactPath?: string,
): string[] {
  const stackNames = new Set<string>();

  if (artifactPath) {
    const baseName = path.basename(artifactPath);
    const withoutExtension = baseName
      .replace(/\.template\.json$/i, "")
      .replace(/\.(json|yaml|yml)$/i, "");
    if (withoutExtension.length > 0) {
      stackNames.add(withoutExtension);
    }
  }

  const metadata = template.Metadata;
  if (metadata && typeof metadata === "object") {
    for (const [key, value] of Object.entries(metadata)) {
      if (key.toLowerCase().includes("stack") && typeof value === "string") {
        stackNames.add(value);
      }
    }
  }

  return [...stackNames].sort();
}

function extractHintValues(
  template: CloudFormationTemplate,
  keys: readonly string[],
): string[] {
  const hints = new Set<string>();

  const parameters = template.Parameters;
  if (parameters && typeof parameters === "object") {
    for (const key of keys) {
      const parameter = parameters[key] as { Default?: unknown } | undefined;
      if (typeof parameter?.Default === "string" && parameter.Default.trim().length > 0) {
        hints.add(parameter.Default);
      }
    }
  }

  const mappings = template.Mappings;
  if (mappings && typeof mappings === "object") {
    for (const mapping of Object.values(mappings)) {
      if (!mapping || typeof mapping !== "object") {
        continue;
      }
      for (const regionMap of Object.values(mapping as Record<string, unknown>)) {
        if (!regionMap || typeof regionMap !== "object") {
          continue;
        }
        for (const key of keys) {
          const value = (regionMap as Record<string, unknown>)[key];
          if (typeof value === "string" && value.trim().length > 0) {
            hints.add(value);
          }
        }
      }
    }
  }

  return [...hints].sort();
}

function classifyResourceDiff(
  before: CloudFormationResource | undefined,
  after: CloudFormationResource | undefined,
): NormalizedResourceAction {
  if (!before && after) {
    return "create";
  }
  if (before && !after) {
    return "delete";
  }
  if (!before || !after) {
    return "no-op";
  }

  const beforeType = before.Type ?? "";
  const afterType = after.Type ?? "";
  if (beforeType !== afterType) {
    return "replace";
  }

  const beforeProperties = JSON.stringify(before.Properties ?? {});
  const afterProperties = JSON.stringify(after.Properties ?? {});
  if (beforeProperties === afterProperties) {
    return "no-op";
  }

  return "update";
}

function buildFingerprintInput(
  summary: Omit<NormalizedTemplateSummary, "templateFingerprintInput">,
): NormalizedTemplateFingerprintInput {
  return {
    templateFormatVersion: summary.templateFormatVersion,
    resourceActionCounts: summary.resourceActionCounts,
    resourceLogicalIds: summary.resourceLogicalIds,
    resourceTypes: summary.resourceTypes,
    sensitiveResourceHints: summary.sensitiveResourceHints,
    stackNames: summary.stackNames,
    accountHints: summary.accountHints,
    regionHints: summary.regionHints,
  };
}

function buildSummaryFromCounts(
  entries: Array<[string, CloudFormationResource]>,
  counts: Record<NormalizedResourceAction, number>,
  options: {
    template: CloudFormationTemplate;
    iacTool: IacTool;
    artifactPath?: string;
  },
): NormalizedTemplateSummary {
  const resourceLogicalIds = entries.map(([logicalId]) => logicalId);
  const resourceTypes = collectResourceTypes(entries);
  const sensitiveResourceHints = collectSensitiveResourceHints(entries);
  const stackNames = extractStackNames(options.template, options.artifactPath);
  const accountHints = extractHintValues(options.template, ["AccountId", "AWS::AccountId"]);
  const regionHints = extractHintValues(options.template, ["Region", "AWS::Region"]);

  const base = {
    resourceActionCounts: counts,
    resourceLogicalIds,
    resourceTypes,
    sensitiveResourceHints,
    stackNames,
    accountHints,
    regionHints,
    templateFormatVersion: options.template.AWSTemplateFormatVersion ?? "unknown",
    sourceTool: options.iacTool === "cdk" ? "cdk" : "cloudformation",
  } as const;

  return {
    ...base,
    templateFingerprintInput: buildFingerprintInput(base),
  };
}

export function buildSynthTemplateSummary(
  template: CloudFormationTemplate,
  options: {
    iacTool: IacTool;
    artifactPath?: string;
  },
): NormalizedTemplateSummary {
  const entries = resourceEntries(template);
  const counts = emptyActionCounts();
  counts.create = entries.length;

  return buildSummaryFromCounts(entries, counts, {
    template,
    iacTool: options.iacTool,
    artifactPath: options.artifactPath,
  });
}

export function buildDiffTemplateSummary(
  beforeTemplate: CloudFormationTemplate,
  afterTemplate: CloudFormationTemplate,
  options: {
    iacTool: IacTool;
    beforeArtifactPath?: string;
    afterArtifactPath?: string;
  },
): NormalizedTemplateSummary {
  const beforeEntries = new Map(resourceEntries(beforeTemplate));
  const afterEntries = new Map(resourceEntries(afterTemplate));
  const logicalIds = [
    ...new Set([...beforeEntries.keys(), ...afterEntries.keys()]),
  ].sort();

  const counts = emptyActionCounts();
  for (const logicalId of logicalIds) {
    const action = classifyResourceDiff(beforeEntries.get(logicalId), afterEntries.get(logicalId));
    counts[action] += 1;
  }

  const mergedTemplate: CloudFormationTemplate = {
    ...afterTemplate,
    Resources: {
      ...(beforeTemplate.Resources ?? {}),
      ...(afterTemplate.Resources ?? {}),
    },
  };

  const entries = logicalIds.map(
    (logicalId): [string, CloudFormationResource] => [
      logicalId,
      afterEntries.get(logicalId) ?? beforeEntries.get(logicalId) ?? {},
    ],
  );

  return buildSummaryFromCounts(entries, counts, {
    template: mergedTemplate,
    iacTool: options.iacTool,
    artifactPath: options.afterArtifactPath ?? options.beforeArtifactPath,
  });
}

export function buildNormalizedTemplateSummary(
  templates: CloudFormationTemplate[],
  options: {
    iacTool: IacTool;
    command: "synth" | "diff" | "deploy-verification";
    artifactPaths: string[];
  },
): NormalizedTemplateSummary {
  if (options.command === "diff") {
    if (templates.length === 1) {
      throw new Control9ActionError(
        "CDK/CloudFormation diff evaluation with one artifact requires a before-and-after template pair.",
      );
    }

    return buildDiffTemplateSummary(templates[0], templates[1], {
      iacTool: options.iacTool,
      beforeArtifactPath: options.artifactPaths[0],
      afterArtifactPath: options.artifactPaths[1],
    });
  }

  if (templates.length < 1) {
    throw new Control9ActionError(
      `${options.iacTool} ${options.command} evaluation requires at least one synthesized template artifact.`,
    );
  }

  return buildSynthTemplateSummary(templates[0], {
    iacTool: options.iacTool,
    artifactPath: options.artifactPaths[0],
  });
}
