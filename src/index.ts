import * as core from "@actions/core";

import { buildSignedActionEnvelope } from "./envelope/build";
import { readActionInputsFromEnv } from "./inputs";
import {
  buildActionResult,
  buildValidationSummary,
  writeSummaryFile,
} from "./outputs";
import { createPolicyClient } from "./policy/client";
import { fingerprintArtifacts, routeCommand } from "./routing";
import { Control9ActionError } from "./types";

export async function runAction(): Promise<void> {
  const inputs = readActionInputsFromEnv();
  const routed = routeCommand(inputs);
  const artifactFingerprint = fingerprintArtifacts(routed.resolvedArtifactPaths);
  const envelope = buildSignedActionEnvelope(inputs, routed);
  const policyClient = createPolicyClient({ apiBaseUrl: inputs.control9ApiUrl });
  const decision = await policyClient.submitEnvelope({ envelope });
  const summary = buildValidationSummary(
    inputs,
    routed,
    artifactFingerprint,
    envelope,
    decision,
  );
  const summaryPath = writeSummaryFile(summary);
  const result = buildActionResult(summaryPath, artifactFingerprint, envelope, decision);

  core.setOutput("envelope-id", result.envelopeId);
  core.setOutput("artifact-fingerprint", result.artifactFingerprint);
  core.setOutput("decision-id", result.decisionId);
  core.setOutput("decision-kind", result.decisionKind);
  core.setOutput("summary-path", result.summaryPath);

  core.info(
    `Control9 submitted ${inputs.iacTool} ${inputs.command} envelope ${result.envelopeId} in ${inputs.mode} mode.`,
  );
  core.info(`Decision ${result.decisionKind}: ${summary.decisionReason}`);
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
