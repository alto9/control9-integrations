import { createHash } from "node:crypto";
import { accessSync, constants, readFileSync } from "node:fs";
import path from "node:path";

import type { ActionInputs, RoutedCommand } from "./types";
import { Control9ActionError } from "./types";

const PLAN_TOOLS = new Set(["terraform", "opentofu"]);
const TEMPLATE_TOOLS = new Set(["cdk", "cloudformation"]);

const ROUTING_MATRIX: Record<
  ActionInputs["iacTool"],
  ReadonlySet<ActionInputs["command"]>
> = {
  terraform: new Set(["plan", "deploy-verification"]),
  opentofu: new Set(["plan", "deploy-verification"]),
  cdk: new Set(["synth", "diff", "deploy-verification"]),
  cloudformation: new Set(["synth", "diff", "deploy-verification"]),
};

function resolveArtifactPath(workingDirectory: string, artifactPath: string): string {
  const resolved = path.resolve(process.cwd(), workingDirectory, artifactPath);
  try {
    accessSync(resolved, constants.R_OK);
  } catch {
    throw new Control9ActionError(
      `Unreadable artifact path "${artifactPath}" under working-directory "${workingDirectory}".`,
    );
  }
  return resolved;
}

function assertArtifactExtension(
  artifactPath: string,
  allowedSuffixes: readonly string[],
): void {
  const normalized = artifactPath.toLowerCase();
  const matches = allowedSuffixes.some((suffix) => normalized.endsWith(suffix));
  if (!matches) {
    throw new Control9ActionError(
      `Artifact "${artifactPath}" does not match expected suffixes: ${allowedSuffixes.join(", ")}.`,
    );
  }
}

function validateArtifactShape(inputs: ActionInputs, resolvedPaths: string[]): void {
  if (PLAN_TOOLS.has(inputs.iacTool)) {
    if (inputs.command === "plan") {
      for (const artifactPath of inputs.artifactPaths) {
        assertArtifactExtension(artifactPath, [".json"]);
      }
      if (resolvedPaths.length !== 1) {
        throw new Control9ActionError(
          `${inputs.iacTool} plan evaluation requires exactly one JSON plan artifact.`,
        );
      }
      return;
    }

    if (inputs.command === "deploy-verification" && resolvedPaths.length !== 1) {
      throw new Control9ActionError(
        `${inputs.iacTool} deploy verification requires exactly one JSON plan artifact.`,
      );
    }
    return;
  }

  if (TEMPLATE_TOOLS.has(inputs.iacTool)) {
    if (inputs.command === "synth" && resolvedPaths.length < 1) {
      throw new Control9ActionError(
        `${inputs.iacTool} synth evaluation requires at least one synthesized template artifact.`,
      );
    }

    if (inputs.command === "diff") {
      if (resolvedPaths.length < 1 || resolvedPaths.length > 2) {
        throw new Control9ActionError(
          `${inputs.iacTool} diff evaluation requires one or two diff/template artifacts.`,
        );
      }
    }

    for (const artifactPath of inputs.artifactPaths) {
      assertArtifactExtension(artifactPath, [".json", ".template.json", ".yaml", ".yml"]);
    }
  }
}

export function routeCommand(inputs: ActionInputs): RoutedCommand {
  const allowedCommands = ROUTING_MATRIX[inputs.iacTool];
  if (!allowedCommands.has(inputs.command)) {
    throw new Control9ActionError(
      `Unsupported command "${inputs.command}" for iac-tool "${inputs.iacTool}".`,
    );
  }

  const resolvedArtifactPaths = inputs.artifactPaths.map((artifactPath) =>
    resolveArtifactPath(inputs.workingDirectory, artifactPath),
  );

  validateArtifactShape(inputs, resolvedArtifactPaths);

  if (inputs.command === "deploy-verification" && inputs.artifactPaths.length > 1) {
    const normalizedPaths = inputs.artifactPaths.map((artifactPath) =>
      artifactPath.replace(/\\/g, "/").toLowerCase(),
    );
    const toolHints = normalizedPaths.map((artifactPath) => {
      if (artifactPath.includes("/cdk/") || artifactPath.includes("cdk/")) {
        return "cdk";
      }
      if (
        artifactPath.includes("/cloudformation/") ||
        artifactPath.includes("cloudformation/")
      ) {
        return "cloudformation";
      }
      if (artifactPath.includes("/terraform/") || artifactPath.includes("terraform/")) {
        return "terraform";
      }
      if (artifactPath.includes("/opentofu/") || artifactPath.includes("opentofu/")) {
        return "opentofu";
      }
      return path.basename(artifactPath);
    });
    const uniqueHints = new Set(toolHints);
    if (uniqueHints.size > 1) {
      throw new Control9ActionError(
        "Ambiguous deploy-verification artifact combination. Provide artifacts from one tool shape only.",
      );
    }
  }

  return {
    iacTool: inputs.iacTool,
    command: inputs.command,
    artifactPaths: inputs.artifactPaths,
    resolvedArtifactPaths,
  };
}

export function fingerprintArtifacts(resolvedArtifactPaths: string[]): string {
  const hash = createHash("sha256");

  for (const artifactPath of [...resolvedArtifactPaths].sort()) {
    hash.update(path.basename(artifactPath));
    hash.update("\0");
    hash.update(readFileSync(artifactPath));
    hash.update("\0");
  }

  return hash.digest("hex");
}
