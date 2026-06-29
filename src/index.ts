import * as core from "@actions/core";

import { readActionInputsFromEnv } from "./inputs";
import {
  buildBootstrapResult,
  buildValidationSummary,
  writeSummaryFile,
} from "./outputs";
import { fingerprintArtifacts, routeCommand } from "./routing";
import { Control9ActionError } from "./types";

export async function runAction(): Promise<void> {
  const inputs = readActionInputsFromEnv();
  const routed = routeCommand(inputs);
  const artifactFingerprint = fingerprintArtifacts(routed.resolvedArtifactPaths);
  const summary = buildValidationSummary(inputs, routed, artifactFingerprint);
  const summaryPath = writeSummaryFile(summary);
  const result = buildBootstrapResult(summaryPath, artifactFingerprint, inputs.mode);

  core.setOutput("envelope-id", result.envelopeId);
  core.setOutput("artifact-fingerprint", result.artifactFingerprint);
  core.setOutput("decision-id", result.decisionId);
  core.setOutput("decision-kind", result.decisionKind);
  core.setOutput("summary-path", result.summaryPath);

  core.info(
    `Control9 validated ${inputs.iacTool} ${inputs.command} artifacts in ${inputs.mode} mode.`,
  );
  core.info(`Summary written to ${summaryPath}.`);
}

async function main(): Promise<void> {
  try {
    await runAction();
  } catch (error) {
    if (error instanceof Control9ActionError) {
      core.setFailed(error.message);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Control9 action failed unexpectedly: ${message}`);
  }
}

void main();
