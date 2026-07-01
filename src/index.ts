import * as core from "@actions/core";

import { buildSignedActionEnvelope } from "./envelope/build";
import { publishWorkflowFeedback } from "./github/workflow-summary";
import { readActionInputsFromEnv } from "./inputs";
import { routePolicySubmissionOutcome } from "./outcomes/route";
import {
  buildActionResult,
  buildFailureValidationSummary,
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
  const submission = await policyClient.submitEnvelopeWithOutcome({ envelope });
  const routedOutcome = routePolicySubmissionOutcome({
    submission,
    artifactFingerprint,
    targetEnvironment: inputs.targetEnvironment,
    redactionReport: envelope.redactionReport,
    runtimeMode: inputs.mode,
  });

  const summary =
    submission.status === "success"
      ? buildValidationSummary(
          inputs,
          routed,
          artifactFingerprint,
          envelope,
          submission.decision,
        )
      : buildFailureValidationSummary(
          inputs,
          routed,
          artifactFingerprint,
          envelope,
          submission,
          routedOutcome.summaryMessage,
        );
  const summaryPath = writeSummaryFile(summary);
  const result = buildActionResult(
    summaryPath,
    artifactFingerprint,
    envelope,
    routedOutcome.decisionKindOutput,
    submission.status === "success" ? submission.decision.decisionId : "",
  );
  const feedback = await publishWorkflowFeedback({
    rendered: routedOutcome.rendered,
    summaryPath,
  });

  core.setOutput("envelope-id", result.envelopeId);
  core.setOutput("artifact-fingerprint", result.artifactFingerprint);
  core.setOutput("decision-id", result.decisionId);
  core.setOutput("decision-kind", result.decisionKind);
  core.setOutput("summary-path", result.summaryPath);
  core.setOutput("summary-written", String(feedback.summaryWritten));
  core.setOutput("pr-comment-state", feedback.prCommentState);

  core.info(
    `Control9 submitted ${inputs.iacTool} ${inputs.command} envelope ${result.envelopeId} in ${inputs.mode} mode.`,
  );
  core.info(`Outcome ${result.decisionKind}: ${summary.message}`);
  core.info(`Summary written to ${summaryPath}.`);

  if (routedOutcome.blocksWorkflow) {
    throw new Control9ActionError(routedOutcome.rendered.summary);
  }
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
