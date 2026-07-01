import { buildSignedActionEnvelope } from "../envelope/build";
import { readGitLabWorkflowContext } from "../envelope/gitlab-context";
import { readActionInputsFromEnv } from "../inputs";
import {
  routePolicySubmissionOutcome,
  routeVerificationSubmissionOutcome,
} from "../outcomes/route";
import {
  buildActionResult,
  buildFailureValidationSummary,
  buildValidationSummary,
  buildVerificationFailureValidationSummary,
  buildVerificationValidationSummary,
  writeSummaryFile,
} from "../outputs";
import { createPolicyClient } from "../policy/client";
import { fingerprintArtifacts, routeCommand } from "../routing";
import { Control9ActionError } from "../types";
import { createVerificationClient } from "../verification/client";
import { publishBaselineLogFeedback } from "./log-output";

export const CONTROL9_PROVIDER_ENV = "CONTROL9_PROVIDER";

export async function runGitLabAssessment(): Promise<void> {
  if (!process.env[CONTROL9_PROVIDER_ENV]?.trim()) {
    process.env[CONTROL9_PROVIDER_ENV] = "gitlab";
  }

  const inputs = readActionInputsFromEnv();
  const routed = routeCommand(inputs);
  const artifactFingerprint = fingerprintArtifacts(routed.resolvedArtifactPaths);
  const workflowContext = readGitLabWorkflowContext();
  const envelope = buildSignedActionEnvelope(inputs, routed, { workflowContext });

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
  buildActionResult(summaryPath, artifactFingerprint, envelope, {
    decisionKind: routedOutcome.decisionKindOutput,
    decisionId: submission.status === "success" ? submission.decision.decisionId : "",
  });

  publishBaselineLogFeedback({
    rendered: routedOutcome.rendered,
    summaryPath,
    presentation: "policy",
  });

  console.log(
    `Control9 submitted ${inputs.iacTool} ${inputs.command} envelope ${envelope.envelopeId} in ${inputs.mode} mode.`,
  );
  console.log(`Outcome ${routedOutcome.decisionKindOutput}: ${summary.message}`);
  console.log(`Summary written to ${summaryPath}.`);

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
  buildActionResult(summaryPath, artifactFingerprint, envelope, {
    verificationId:
      submission.status === "success" ? submission.verification.verificationId : "",
    verificationStatus: routedOutcome.verificationStatusOutput,
    decisionId:
      submission.status === "success" ? (submission.verification.decisionId ?? "") : "",
  });

  publishBaselineLogFeedback({
    rendered: routedOutcome.rendered,
    summaryPath,
    presentation: "deploy-verification",
  });

  console.log(
    `Control9 submitted ${inputs.iacTool} deploy verification envelope ${envelope.envelopeId} in ${inputs.mode} mode.`,
  );
  console.log(`Verification ${routedOutcome.verificationStatusOutput}: ${summary.message}`);
  console.log(`Summary written to ${summaryPath}.`);

  if (routedOutcome.blocksWorkflow) {
    throw new Control9ActionError(routedOutcome.rendered.summary);
  }
}
