import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import { Control9ActionError } from "../types";
import type { CloudFormationTemplate } from "./types";

function isTerraformPlanShape(parsed: Record<string, unknown>): boolean {
  return (
    typeof parsed.format_version === "string" &&
    Array.isArray(parsed.resource_changes)
  );
}

function assertTemplateObject(parsed: unknown): asserts parsed is CloudFormationTemplate {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Control9ActionError(
      "CDK/CloudFormation template artifacts must be JSON or YAML objects with a Resources map.",
    );
  }

  const record = parsed as Record<string, unknown>;
  if (isTerraformPlanShape(record)) {
    throw new Control9ActionError(
      "Artifact looks like a Terraform/OpenTofu plan JSON file. Use iac-tool terraform or opentofu for plan artifacts.",
    );
  }

  if (!record.Resources || typeof record.Resources !== "object" || Array.isArray(record.Resources)) {
    throw new Control9ActionError(
      "CDK/CloudFormation template artifacts must include a Resources object.",
    );
  }

  if (Object.keys(record.Resources as Record<string, unknown>).length === 0) {
    throw new Control9ActionError(
      "CDK/CloudFormation template Resources must not be empty.",
    );
  }
}

function parseYamlContent(content: string): unknown {
  try {
    return parseYaml(content);
  } catch {
    throw new Control9ActionError(
      "CDK/CloudFormation YAML template is malformed and could not be parsed.",
    );
  }
}

export function parseTemplateContent(content: string, artifactPath?: string): CloudFormationTemplate {
  const extension = artifactPath ? path.extname(artifactPath).toLowerCase() : "";
  const isYaml = extension === ".yaml" || extension === ".yml";

  let parsed: unknown;
  if (isYaml) {
    parsed = parseYamlContent(content);
  } else {
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Control9ActionError(
        "CDK/CloudFormation template JSON is malformed and could not be parsed.",
      );
    }
  }

  assertTemplateObject(parsed);
  return parsed;
}

export function parseTemplateFile(templatePath: string): CloudFormationTemplate {
  const content = readFileSync(templatePath, "utf8");
  return parseTemplateContent(content, templatePath);
}
