import type { RuntimeMode } from "../types";
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
  buildPolicyDecisionSummary,
  buildPolicyDetailLines,
  buildRedactionAppliedSummary,
  buildMalformedResponseSummary,
  buildTimeoutSummary,
  buildUnavailableApiSummary,
  formatFollowUpAction,
  formatRedactionStatus,
} from "./templates";

function resolveBlockingBehavior(
  outcomeKind: RenderOutcomeKind,
  runtimeMode: RuntimeMode | undefined,
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

  if (runtimeMode === "shadow") {
    return { isAdvisory: outcomeKind === "require_approval", blocksWorkflow: false };
  }

  if (outcomeKind === "deny" || outcomeKind === "fingerprint_mismatch") {
    return { isAdvisory: false, blocksWorkflow: true };
  }

  if (outcomeKind === "require_approval") {
    return { isAdvisory: false, blocksWorkflow: true };
  }

  if (outcomeKind === "unavailable_api" || outcomeKind === "timeout") {
    return {
      isAdvisory: false,
      blocksWorkflow: runtimeMode === "enforce",
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
  const summary = buildTimeoutSummary(input.runtimeMode);
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

function renderUnavailableApi(
  input: Extract<DecisionRenderInput, { kind: "unavailable_api" }>,
): RenderedDecisionFeedback {
  const outcomeKind = "unavailable_api";
  const template = OUTCOME_TEMPLATES[outcomeKind];
  const summary = buildUnavailableApiSummary(input.runtimeMode);
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
  );
  const detailLines = buildErrorDetailLines(outcomeKind, input);

  return {
    outcomeKind,
    label: template.label,
    title: template.title,
    summary,
    detailLines,
    bodyMarkdown: buildBodyMarkdown(template.title, summary, detailLines),
    annotationMessage: `${template.label} — ${summary}`,
    isAdvisory: false,
    blocksWorkflow: true,
    metadata: {
      targetEnvironment: input.targetEnvironment,
      expectedFingerprint: input.expectedFingerprint,
      actualFingerprint: input.actualFingerprint,
    },
  };
}
