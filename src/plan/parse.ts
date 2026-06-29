import { readFileSync } from "node:fs";

import { Control9ActionError } from "../types";
import {
  SUPPORTED_PLAN_FORMAT_VERSIONS,
  type TerraformPlanJson,
} from "./types";

function assertPlanObject(parsed: unknown): asserts parsed is TerraformPlanJson {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Control9ActionError(
      "Terraform/OpenTofu plan JSON must be a JSON object produced by `terraform show -json` or `tofu show -json`.",
    );
  }
}

export function parsePlanJsonContent(content: string): TerraformPlanJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Control9ActionError(
      "Terraform/OpenTofu plan JSON is malformed and could not be parsed.",
    );
  }

  assertPlanObject(parsed);

  const formatVersion = parsed.format_version;
  if (typeof formatVersion !== "string" || formatVersion.trim().length === 0) {
    throw new Control9ActionError(
      "Terraform/OpenTofu plan JSON is missing a supported format_version field.",
    );
  }

  if (!SUPPORTED_PLAN_FORMAT_VERSIONS.has(formatVersion)) {
    throw new Control9ActionError(
      `Unsupported Terraform/OpenTofu plan format_version "${formatVersion}". Supported versions: ${[...SUPPORTED_PLAN_FORMAT_VERSIONS].join(", ")}.`,
    );
  }

  if (!Array.isArray(parsed.resource_changes)) {
    throw new Control9ActionError(
      "Terraform/OpenTofu plan JSON is missing a resource_changes array.",
    );
  }

  return parsed;
}

export function parsePlanJsonFile(planPath: string): TerraformPlanJson {
  const content = readFileSync(planPath, "utf8");
  return parsePlanJsonContent(content);
}
