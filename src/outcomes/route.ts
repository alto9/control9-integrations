import type { RedactionReport } from "../envelope/types";
import type { PolicySubmissionResult } from "../policy/submission";
import type { DecisionRenderInput } from "../rendering/types";
import { renderDecisionFeedback } from "../rendering/decision-renderer";
import type { RenderedDecisionFeedback } from "../rendering/types";
import type { OutputDecisionKind, RuntimeMode } from "../types";

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
