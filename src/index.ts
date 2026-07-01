import * as core from "@actions/core";

import { buildSignedActionEnvelope } from "./envelope/build";
import { publishWorkflowFeedback } from "./github/workflow-summary";
import { readActionInputsFromEnv } from "./inputs";
import {
  routePolicySubmissionOutcome,
  routeVerificationSubmissionOutcome,
} from "./outcomes/route";
import {
  buildActionResult,
  buildFailureValidationSummary,
  buildValidationSummary,
  buildVerificationFailureValidationSummary,
  buildVerificationValidationSummary,
  writeSummaryFile,
} from "./outputs";
import { createPolicyClient } from "./policy/client";
import { fingerprintArtifacts, routeCommand } from "./routing";
import { Control9ActionError } from "./types";
import { createVerificationClient } from "./verification/client";

export async function runAction(): Promise<void> {
  const inputs = readActionInputsFromEnv();
  const routed = routeCommand(inputs);
  const artifactFingerprint = fingerprintArtifacts(routed.resolvedArtifactPaths);
  const envelope = buildSignedActionEnvelope(inputs, routed);

  if (inputs.command === "deploy-verification") {
    await runDeployVerificationFlow({
      inputs,
      routed,
      artifactFingerprint,
      envelope,
    });
    return;
  }

  await runPolicyFlow({
    inputs,
    routed,
    artifactFingerprint,
    envelope,
  });
}

async function runPolicyFlow(options: {
  inputs: ReturnType<typeof readActionInputsFromEnv>;
  routed: ReturnType<typeof routeCommand>;
  artifactFingerprint: string;
  envelope: ReturnType<typeof buildSignedActionEnvelope>;
}): Promise<void> {
  const { inputs, routed, artifactFingerprint, envelope } = options;
  const policyClient = createPolicyClient({ apiBaseUrl: inputs.control9ApiUrl });
  const submission = await policyClient.submitEnvelopeWithOutcome({ envelope });
  const routedOutcome = routePolicySubmissionOutcome({
    submission,
    artifactFingerprint,
    targetEnvironment: inputs.targetEnvironment,
    redactionReport: envelope.redactionReport,
    runtimeMode: inputs.mode,
    failOpenEnvironments: inputs.failOpenEnvironments,
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
  const result = buildActionResult(summaryPath, artifactFingerprint, envelope, {
    decisionKind: routedOutcome.decisionKindOutput,
    decisionId: submission.status === "success" ? submission.decision.decisionId : "",
  });
  const feedback = await publishWorkflowFeedback({
    rendered: routedOutcome.rendered,
    summaryPath,
    presentation: "policy",
  });

  core.setOutput("envelope-id", result.envelopeId);
  core.setOutput("artifact-fingerprint", result.artifactFingerprint);
  core.setOutput("decision-id", result.decisionId);
  core.setOutput("decision-kind", result.decisionKind);
  core.setOutput("verification-id", result.verificationId);
  core.setOutput("verification-status", result.verificationStatus);
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

async function runDeployVerificationFlow(options: {
  inputs: ReturnType<typeof readActionInputsFromEnv>;
  routed: ReturnType<typeof routeCommand>;
  artifactFingerprint: string;
  envelope: ReturnType<typeof buildSignedActionEnvelope>;
}): Promise<void> {
  const { inputs, routed, artifactFingerprint, envelope } = options;
  const verificationClient = createVerificationClient({ apiBaseUrl: inputs.control9ApiUrl });
  const submission = await verificationClient.submitVerificationWithOutcome({ envelope });
  const routedOutcome = routeVerificationSubmissionOutcome({
    submission,
    artifactFingerprint,
    targetEnvironment: inputs.targetEnvironment,
    runtimeMode: inputs.mode,
    failOpenEnvironments: inputs.failOpenEnvironments,
  });

  const summary =
    submission.status === "success"
      ? buildVerificationValidationSummary(
          inputs,
          routed,
          artifactFingerprint,
          envelope,
          submission.verification,
        )
      : buildVerificationFailureValidationSummary(
          inputs,
          routed,
          artifactFingerprint,
          envelope,
          submission,
          routedOutcome.summaryMessage,
        );
  const summaryPath = writeSummaryFile(summary);
  const result = buildActionResult(summaryPath, artifactFingerprint, envelope, {
    verificationId:
      submission.status === "success" ? submission.verification.verificationId : "",
    verificationStatus: routedOutcome.verificationStatusOutput,
    decisionId:
      submission.status === "success" ? (submission.verification.decisionId ?? "") : "",
  });
  const feedback = await publishWorkflowFeedback({
    rendered: routedOutcome.rendered,
    summaryPath,
    presentation: "deploy-verification",
  });

  core.setOutput("envelope-id", result.envelopeId);
  core.setOutput("artifact-fingerprint", result.artifactFingerprint);
  core.setOutput("decision-id", result.decisionId);
  core.setOutput("decision-kind", result.decisionKind);
  core.setOutput("verification-id", result.verificationId);
  core.setOutput("verification-status", result.verificationStatus);
  core.setOutput("summary-path", result.summaryPath);
  core.setOutput("summary-written", String(feedback.summaryWritten));
  core.setOutput("pr-comment-state", feedback.prCommentState);

  core.info(
    `Control9 submitted ${inputs.iacTool} deploy verification envelope ${result.envelopeId} in ${inputs.mode} mode.`,
  );
  core.info(`Verification ${result.verificationStatus}: ${summary.message}`);
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
