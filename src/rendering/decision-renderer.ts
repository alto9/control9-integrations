import type { RuntimeMode } from "../types";
import { isFailOpenPath, resolveApiFailureBlocksWorkflow } from "../blocking/resolve-blocking";
import type {
  DecisionRenderInput,
  RenderedDecisionFeedback,
  RenderOutcomeKind,
} from "./types";
import {
  OUTCOME_TEMPLATES,
  buildBodyMarkdown,
  buildErrorDetailLines,
  buildFingerprintMismatchSummary,
  buildNoApprovedBaselineSummary,
  buildPolicyDecisionSummary,
  buildPolicyDetailLines,
  buildRedactionAppliedSummary,
  buildMalformedResponseSummary,
  buildTimeoutSummary,
  buildUnavailableApiSummary,
  buildVerifiedSummary,
  formatFollowUpAction,
  formatRedactionStatus,
} from "./templates";

function resolveBlockingBehavior(
  outcomeKind: RenderOutcomeKind,
  runtimeMode: RuntimeMode | undefined,
  targetEnvironment?: string,
  failOpenEnvironments?: string[],
): { isAdvisory: boolean; blocksWorkflow: boolean } {
  if (outcomeKind === "observe") {
    return { isAdvisory: true, blocksWorkflow: false };
  }

  if (outcomeKind === "allow") {
    return { isAdvisory: false, blocksWorkflow: false };
  }

  if (outcomeKind === "malformed_response") {
    return { isAdvisory: false, blocksWorkflow: true };
  }

  if (outcomeKind === "verified") {
    return { isAdvisory: false, blocksWorkflow: false };
  }

  if (outcomeKind === "fingerprint_mismatch" || outcomeKind === "no_approved_baseline") {
    if (runtimeMode === "shadow") {
      return { isAdvisory: true, blocksWorkflow: false };
    }
    return { isAdvisory: false, blocksWorkflow: true };
  }

  if (runtimeMode === "shadow") {
    return { isAdvisory: outcomeKind === "require_approval", blocksWorkflow: false };
  }

  if (outcomeKind === "deny") {
    return { isAdvisory: false, blocksWorkflow: true };
  }

  if (outcomeKind === "require_approval") {
    return { isAdvisory: false, blocksWorkflow: true };
  }

  if (outcomeKind === "unavailable_api" || outcomeKind === "timeout") {
    if (!runtimeMode || !targetEnvironment) {
      return {
        isAdvisory: false,
        blocksWorkflow: runtimeMode === "enforce",
      };
    }

    const blocksWorkflow = resolveApiFailureBlocksWorkflow({
      failureKind: outcomeKind,
      mode: runtimeMode,
      targetEnvironment,
      failOpenEnvironments: failOpenEnvironments ?? [],
    });

    return {
      isAdvisory: !blocksWorkflow,
      blocksWorkflow,
    };
  }

  return { isAdvisory: false, blocksWorkflow: false };
}

export function renderDecisionFeedback(input: DecisionRenderInput): RenderedDecisionFeedback {
  switch (input.kind) {
    case "policy_decision":
      return renderPolicyDecision(input);
    case "timeout":
      return renderTimeout(input);
    case "unavailable_api":
      return renderUnavailableApi(input);
    case "malformed_response":
      return renderMalformedResponse(input);
    case "redaction_applied":
      return renderRedactionApplied(input);
    case "fingerprint_mismatch":
      return renderFingerprintMismatch(input);
    case "verified":
      return renderVerified(input);
    case "no_approved_baseline":
      return renderNoApprovedBaseline(input);
  }
}

function renderPolicyDecision(
  input: Extract<DecisionRenderInput, { kind: "policy_decision" }>,
): RenderedDecisionFeedback {
  const outcomeKind = input.decision.decisionKind;
  const template = OUTCOME_TEMPLATES[outcomeKind];
  const summary = buildPolicyDecisionSummary(outcomeKind, input.decision, input.runtimeMode);
  const detailLines = buildPolicyDetailLines({
    decision: input.decision,
    artifactFingerprint: input.artifactFingerprint,
    targetEnvironment: input.targetEnvironment,
    redactionReport: input.redactionReport,
  });
  const behavior = resolveBlockingBehavior(outcomeKind, input.runtimeMode);

  return {
    outcomeKind,
    label: template.label,
    title: template.title,
    summary,
    detailLines,
    bodyMarkdown: buildBodyMarkdown(template.title, summary, detailLines),
    annotationMessage: `${template.label} — ${summary}`,
    ...behavior,
    metadata: {
      decisionId: input.decision.decisionId,
      policyVersion: input.decision.policyVersion,
      artifactFingerprint: input.artifactFingerprint,
      targetEnvironment: input.targetEnvironment,
      redactionStatus: formatRedactionStatus(input.redactionReport),
      followUpAction: formatFollowUpAction(input.decision.followUp),
    },
  };
}

function renderTimeout(
  input: Extract<DecisionRenderInput, { kind: "timeout" }>,
): RenderedDecisionFeedback {
  const outcomeKind = "timeout";
  const template = OUTCOME_TEMPLATES[outcomeKind];
  const failOpen =
    input.runtimeMode && input.targetEnvironment
      ? isFailOpenPath(
          input.runtimeMode,
          input.targetEnvironment,
          input.failOpenEnvironments ?? [],
        )
      : false;
  const summary = buildTimeoutSummary(input.runtimeMode, failOpen);
  const detailLines = buildErrorDetailLines(outcomeKind, input);
  const behavior = resolveBlockingBehavior(
    outcomeKind,
    input.runtimeMode,
    input.targetEnvironment,
    input.failOpenEnvironments,
  );

  return {
    outcomeKind,
    label: template.label,
    title: template.title,
    summary,
    detailLines,
    bodyMarkdown: buildBodyMarkdown(template.title, summary, detailLines),
    annotationMessage: `${template.label} — ${summary}`,
    ...behavior,
    metadata: {
      artifactFingerprint: input.artifactFingerprint,
      targetEnvironment: input.targetEnvironment,
    },
  };
}

function renderUnavailableApi(
  input: Extract<DecisionRenderInput, { kind: "unavailable_api" }>,
): RenderedDecisionFeedback {
  const outcomeKind = "unavailable_api";
  const template = OUTCOME_TEMPLATES[outcomeKind];
  const failOpen =
    input.runtimeMode && input.targetEnvironment
      ? isFailOpenPath(
          input.runtimeMode,
          input.targetEnvironment,
          input.failOpenEnvironments ?? [],
        )
      : false;
  const summary = buildUnavailableApiSummary(input.runtimeMode, failOpen);
  const detailLines = buildErrorDetailLines(outcomeKind, input);
  const behavior = resolveBlockingBehavior(
    outcomeKind,
    input.runtimeMode,
    input.targetEnvironment,
    input.failOpenEnvironments,
  );

  return {
    outcomeKind,
    label: template.label,
    title: template.title,
    summary,
    detailLines,
    bodyMarkdown: buildBodyMarkdown(template.title, summary, detailLines),
    annotationMessage: `${template.label} — ${summary}`,
    ...behavior,
    metadata: {
      artifactFingerprint: input.artifactFingerprint,
      targetEnvironment: input.targetEnvironment,
    },
  };
}

function renderMalformedResponse(
  input: Extract<DecisionRenderInput, { kind: "malformed_response" }>,
): RenderedDecisionFeedback {
  const outcomeKind = "malformed_response";
  const template = OUTCOME_TEMPLATES[outcomeKind];
  const summary = buildMalformedResponseSummary(input.detail);
  const detailLines = buildErrorDetailLines(outcomeKind, input);
  const behavior = resolveBlockingBehavior(outcomeKind, input.runtimeMode);

  return {
    outcomeKind,
    label: template.label,
    title: template.title,
    summary,
    detailLines,
    bodyMarkdown: buildBodyMarkdown(template.title, summary, detailLines),
    annotationMessage: `${template.label} — ${summary}`,
    ...behavior,
    metadata: {
      artifactFingerprint: input.artifactFingerprint,
      targetEnvironment: input.targetEnvironment,
    },
  };
}

function renderRedactionApplied(
  input: Extract<DecisionRenderInput, { kind: "redaction_applied" }>,
): RenderedDecisionFeedback {
  const outcomeKind = "redaction_applied";
  const template = OUTCOME_TEMPLATES[outcomeKind];
  const summary = buildRedactionAppliedSummary(input.redactionReport);
  const detailLines = buildErrorDetailLines(outcomeKind, {
    artifactFingerprint: input.artifactFingerprint,
    targetEnvironment: input.targetEnvironment,
    redactionReport: input.redactionReport,
  });

  return {
    outcomeKind,
    label: template.label,
    title: template.title,
    summary,
    detailLines,
    bodyMarkdown: buildBodyMarkdown(template.title, summary, detailLines),
    annotationMessage: `${template.label} — ${summary}`,
    isAdvisory: true,
    blocksWorkflow: false,
    metadata: {
      artifactFingerprint: input.artifactFingerprint,
      targetEnvironment: input.targetEnvironment,
      redactionStatus: formatRedactionStatus(input.redactionReport),
    },
  };
}

function renderFingerprintMismatch(
  input: Extract<DecisionRenderInput, { kind: "fingerprint_mismatch" }>,
): RenderedDecisionFeedback {
  const outcomeKind = "fingerprint_mismatch";
  const template = OUTCOME_TEMPLATES[outcomeKind];
  const summary = buildFingerprintMismatchSummary(
    input.expectedFingerprint,
    input.actualFingerprint,
    input.runtimeMode,
  );
  const detailLines = buildErrorDetailLines(outcomeKind, input);
  const behavior = resolveBlockingBehavior(outcomeKind, input.runtimeMode);

  return {
    outcomeKind,
    label: template.label,
    title: template.title,
    summary,
    detailLines,
    bodyMarkdown: buildBodyMarkdown(template.title, summary, detailLines),
    annotationMessage: `${template.label} — ${summary}`,
    ...behavior,
    metadata: {
      targetEnvironment: input.targetEnvironment,
      expectedFingerprint: input.expectedFingerprint,
      actualFingerprint: input.actualFingerprint,
    },
  };
}

function renderVerified(
  input: Extract<DecisionRenderInput, { kind: "verified" }>,
): RenderedDecisionFeedback {
  const outcomeKind = "verified";
  const template = OUTCOME_TEMPLATES[outcomeKind];
  const summary = buildVerifiedSummary(input.artifactFingerprint, input.runtimeMode);
  const detailLines = buildErrorDetailLines(outcomeKind, input);
  const behavior = resolveBlockingBehavior(outcomeKind, input.runtimeMode);

  return {
    outcomeKind,
    label: template.label,
    title: template.title,
    summary,
    detailLines,
    bodyMarkdown: buildBodyMarkdown(template.title, summary, detailLines),
    annotationMessage: `${template.label} — ${summary}`,
    ...behavior,
    metadata: {
      verificationId: input.verificationId,
      decisionId: input.decisionId,
      artifactFingerprint: input.artifactFingerprint,
      targetEnvironment: input.targetEnvironment,
    },
  };
}

function renderNoApprovedBaseline(
  input: Extract<DecisionRenderInput, { kind: "no_approved_baseline" }>,
): RenderedDecisionFeedback {
  const outcomeKind = "no_approved_baseline";
  const template = OUTCOME_TEMPLATES[outcomeKind];
  const summary = buildNoApprovedBaselineSummary(input.reason, input.runtimeMode);
  const detailLines = buildErrorDetailLines(outcomeKind, input);
  const behavior = resolveBlockingBehavior(outcomeKind, input.runtimeMode);

  return {
    outcomeKind,
    label: template.label,
    title: template.title,
    summary,
    detailLines,
    bodyMarkdown: buildBodyMarkdown(template.title, summary, detailLines),
    annotationMessage: `${template.label} — ${summary}`,
    ...behavior,
    metadata: {
      verificationId: input.verificationId,
      decisionId: input.decisionId,
      artifactFingerprint: input.artifactFingerprint,
      targetEnvironment: input.targetEnvironment,
    },
  };
}
