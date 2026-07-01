import type { RedactionReport } from "../envelope/types";
import type { PolicySubmissionResult } from "../policy/submission";
import type { VerificationSubmissionResult } from "../verification/submission";
import type { DeployVerification, VerificationStatus } from "../verification/types";
import type { DecisionRenderInput } from "../rendering/types";
import { renderDecisionFeedback } from "../rendering/decision-renderer";
import type { RenderedDecisionFeedback } from "../rendering/types";
import type { OutputDecisionKind, OutputVerificationStatus, RuntimeMode } from "../types";

export interface RoutedPolicyOutcome {
  renderInput: DecisionRenderInput;
  rendered: RenderedDecisionFeedback;
  blocksWorkflow: boolean;
  decisionKindOutput: OutputDecisionKind;
  summaryMessage: string;
}

export interface RoutePolicyOutcomeOptions {
  submission: PolicySubmissionResult;
  artifactFingerprint: string;
  targetEnvironment: string;
  redactionReport: RedactionReport;
  runtimeMode: RuntimeMode;
}

function resolveApiFailureBlocking(
  failureKind: "unavailable_api" | "timeout" | "malformed_response",
  runtimeMode: RuntimeMode,
): boolean {
  if (failureKind === "malformed_response") {
    return true;
  }

  return runtimeMode === "enforce";
}

export interface RoutedVerificationOutcome {
  renderInput: DecisionRenderInput;
  rendered: RenderedDecisionFeedback;
  blocksWorkflow: boolean;
  verificationStatusOutput: OutputVerificationStatus;
  summaryMessage: string;
}

export interface RouteVerificationOutcomeOptions {
  submission: VerificationSubmissionResult;
  artifactFingerprint: string;
  targetEnvironment: string;
  runtimeMode: RuntimeMode;
}

function resolveVerificationBlocking(
  verificationStatus: VerificationStatus,
  runtimeMode: RuntimeMode,
): boolean {
  if (verificationStatus === "verified") {
    return false;
  }

  return runtimeMode === "enforce";
}

export function routeVerificationSubmissionOutcome(
  options: RouteVerificationOutcomeOptions,
): RoutedVerificationOutcome {
  const { submission, artifactFingerprint, targetEnvironment, runtimeMode } = options;

  if (submission.status === "success") {
    const { verification } = submission;
    const renderInput = buildVerificationRenderInput({
      verification,
      artifactFingerprint,
      targetEnvironment,
      runtimeMode,
    });
    const rendered = renderDecisionFeedback(renderInput);
    const blocksWorkflow = resolveVerificationBlocking(
      verification.verificationStatus,
      runtimeMode,
    );

    return {
      renderInput,
      rendered: {
        ...rendered,
        blocksWorkflow,
      },
      blocksWorkflow,
      verificationStatusOutput: verification.verificationStatus,
      summaryMessage: rendered.summary,
    };
  }

  const renderInput: DecisionRenderInput =
    submission.failureKind === "malformed_response"
      ? {
          kind: "malformed_response",
          artifactFingerprint,
          targetEnvironment,
          detail: submission.detail,
          runtimeMode,
        }
      : {
          kind: submission.failureKind,
          artifactFingerprint,
          targetEnvironment,
          runtimeMode,
        };

  const rendered = renderDecisionFeedback(renderInput);
  const blocksWorkflow = resolveApiFailureBlocking(submission.failureKind, runtimeMode);

  return {
    renderInput,
    rendered: {
      ...rendered,
      blocksWorkflow,
    },
    blocksWorkflow,
    verificationStatusOutput: submission.failureKind,
    summaryMessage: rendered.summary,
  };
}

function buildVerificationRenderInput(options: {
  verification: DeployVerification;
  artifactFingerprint: string;
  targetEnvironment: string;
  runtimeMode: RuntimeMode;
}): DecisionRenderInput {
  const { verification, artifactFingerprint, targetEnvironment, runtimeMode } = options;

  switch (verification.verificationStatus) {
    case "verified":
      return {
        kind: "verified",
        verificationId: verification.verificationId,
        decisionId: verification.decisionId,
        artifactFingerprint,
        targetEnvironment,
        runtimeMode,
      };
    case "fingerprint_mismatch":
      return {
        kind: "fingerprint_mismatch",
        expectedFingerprint: verification.expectedFingerprint,
        actualFingerprint: verification.actualFingerprint ?? artifactFingerprint,
        targetEnvironment,
        runtimeMode,
      };
    case "no_approved_baseline":
      return {
        kind: "no_approved_baseline",
        verificationId: verification.verificationId,
        reason: verification.reason ?? "No approved fingerprint exists for this governed change context.",
        decisionId: verification.decisionId,
        artifactFingerprint,
        targetEnvironment,
        runtimeMode,
      };
  }
}

export function routePolicySubmissionOutcome(
  options: RoutePolicyOutcomeOptions,
): RoutedPolicyOutcome {
  const {
    submission,
    artifactFingerprint,
    targetEnvironment,
    redactionReport,
    runtimeMode,
  } = options;

  if (submission.status === "success") {
    const renderInput: DecisionRenderInput = {
      kind: "policy_decision",
      decision: submission.decision,
      artifactFingerprint,
      targetEnvironment,
      redactionReport,
      runtimeMode,
    };
    const rendered = renderDecisionFeedback(renderInput);

    return {
      renderInput,
      rendered,
      blocksWorkflow: rendered.blocksWorkflow,
      decisionKindOutput: submission.decision.decisionKind,
      summaryMessage: submission.decision.reason,
    };
  }

  const renderInput: DecisionRenderInput =
    submission.failureKind === "malformed_response"
      ? {
          kind: "malformed_response",
          artifactFingerprint,
          targetEnvironment,
          detail: submission.detail,
          runtimeMode,
        }
      : {
          kind: submission.failureKind,
          artifactFingerprint,
          targetEnvironment,
          runtimeMode,
        };

  const rendered = renderDecisionFeedback(renderInput);
  const blocksWorkflow = resolveApiFailureBlocking(submission.failureKind, runtimeMode);

  return {
    renderInput,
    rendered: {
      ...rendered,
      blocksWorkflow,
    },
    blocksWorkflow,
    decisionKindOutput: submission.failureKind,
    summaryMessage: rendered.summary,
  };
}
