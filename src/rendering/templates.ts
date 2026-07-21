import type { PolicyDecision, RedactionReport } from "../envelope/types";
import type { RuntimeMode } from "../types";
import type { RenderOutcomeKind } from "./types";

export interface OutcomeTemplate {
  label: string;
  title: string;
}

export const OUTCOME_TEMPLATES: Record<RenderOutcomeKind, OutcomeTemplate> = {
  allow: {
    label: "Decision: Allow",
    title: "Control9 allowed this change",
  },
  deny: {
    label: "Decision: Deny",
    title: "Control9 denied this change",
  },
  require_approval: {
    label: "Decision: Approval Required",
    title: "Control9 requires approval for this change",
  },
  observe: {
    label: "Decision: Observe (Advisory)",
    title: "Control9 advisory finding",
  },
  timeout: {
    label: "Outcome: Policy API Timeout",
    title: "Control9 policy request timed out",
  },
  unavailable_api: {
    label: "Outcome: Policy API Unavailable",
    title: "Control9 policy API is unavailable",
  },
  malformed_response: {
    label: "Outcome: Malformed Policy Response",
    title: "Control9 received an invalid policy response",
  },
  redaction_applied: {
    label: "Outcome: Redaction Applied",
    title: "Control9 redaction was applied before submission",
  },
  fingerprint_mismatch: {
    label: "Outcome: Fingerprint Mismatch",
    title: "Control9 detected an artifact fingerprint mismatch",
  },
  verified: {
    label: "Outcome: Verified",
    title: "Control9 verified this artifact fingerprint",
  },
  no_approved_baseline: {
    label: "Outcome: No Approved Baseline",
    title: "Control9 found no approved baseline for this change",
  },
};

export function formatRedactionStatus(report: RedactionReport | undefined): string | undefined {
  if (!report) {
    return undefined;
  }

  if (report.totalRedactions === 0) {
    return `No redactions applied (profile: ${report.profile})`;
  }

  const markerSummary = report.markers
    .map((marker) => `${marker.valueClass}: ${marker.count}`)
    .join(", ");

  return `${report.totalRedactions} value(s) redacted (profile: ${report.profile}; ${markerSummary})`;
}

export function formatFollowUpAction(followUp: PolicyDecision["followUp"]): string | undefined {
  if (!followUp) {
    return undefined;
  }

  const approvalUrl = readSafeFollowUpString(followUp, "approval_url", "approvalUrl");
  if (approvalUrl) {
    return `Approval required at ${approvalUrl}`;
  }

  const action = readSafeFollowUpString(followUp, "action", "action");
  if (action) {
    return action;
  }

  return undefined;
}

function readSafeFollowUpString(
  followUp: Record<string, unknown>,
  snakeCase: string,
  camelCase: string,
): string | undefined {
  for (const key of [snakeCase, camelCase]) {
    const value = followUp[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function buildPolicyDecisionSummary(
  outcomeKind: Exclude<
    RenderOutcomeKind,
    | "timeout"
    | "unavailable_api"
    | "malformed_response"
    | "redaction_applied"
    | "fingerprint_mismatch"
    | "verified"
    | "no_approved_baseline"
  >,
  decision: PolicyDecision,
  runtimeMode: RuntimeMode | undefined,
): string {
  switch (outcomeKind) {
    case "allow":
      return decision.reason;
    case "deny":
      return runtimeMode === "shadow"
        ? `${decision.reason} Shadow mode is active, so this workflow is not blocked by Control9.`
        : decision.reason;
    case "require_approval":
      return runtimeMode === "shadow"
        ? `${decision.reason} Shadow mode is active, so this workflow is not waiting for approval.`
        : decision.reason;
    case "observe":
      return `${decision.reason} Control9 is reporting an advisory finding and this workflow is not blocked by that decision.`;
  }
}

export function buildTimeoutSummary(
  runtimeMode?: RuntimeMode,
  isFailOpenPath?: boolean,
): string {
  const base =
    "Control9 could not receive a policy decision before the configured request timeout expired. Review the workflow logs and Control9 service status, then rerun the job when the policy API is reachable.";
  if (runtimeMode === "shadow") {
    return `${base} Shadow mode is active, so this workflow is not blocked by Control9.`;
  }
  if (isFailOpenPath) {
    return `${base} This workflow continued because this environment is configured to fail open on API unavailability.`;
  }
  return base;
}

export function buildUnavailableApiSummary(
  runtimeMode?: RuntimeMode,
  isFailOpenPath?: boolean,
  detail?: string,
): string {
  const trimmedDetail = detail?.trim();
  const base = trimmedDetail
    ? trimmedDetail
    : "Control9 could not reach the policy API after bounded retries. Review network access, API endpoint configuration, and Control9 service status before rerunning the job.";
  if (runtimeMode === "shadow") {
    return `${base} Shadow mode is active, so this workflow is not blocked by Control9.`;
  }
  if (isFailOpenPath) {
    return `${base} This workflow continued because this environment is configured to fail open on API unavailability.`;
  }
  return base;
}

export function buildMalformedResponseSummary(detail?: string): string {
  const base =
    "Control9 received a policy API response that could not be normalized into a decision.";
  if (detail?.trim()) {
    return `${base} ${detail.trim()}`;
  }
  return `${base} Review Control9 service logs and API contract compatibility before rerunning the job.`;
}

export function buildRedactionAppliedSummary(report: RedactionReport): string {
  const status = formatRedactionStatus(report);
  return `Sensitive values were redacted from the action envelope before submission. ${status ?? "Redaction completed."}`;
}

export function buildFingerprintMismatchSummary(
  expectedFingerprint: string | undefined,
  actualFingerprint: string | undefined,
  runtimeMode?: RuntimeMode,
): string {
  const expected = expectedFingerprint ?? "unknown";
  const actual = actualFingerprint ?? "unknown";
  const base = `The current artifact fingerprint (${actual}) does not match the approved fingerprint (${expected}). Review the change set before proceeding with deploy authority.`;
  if (runtimeMode === "shadow") {
    return `${base} Shadow mode is active, so this workflow is not blocked by Control9.`;
  }
  return base;
}

export function buildVerifiedSummary(
  artifactFingerprint: string | undefined,
  runtimeMode?: RuntimeMode,
): string {
  const fingerprint = artifactFingerprint ?? "the submitted artifact";
  const base = `The current artifact fingerprint matches the approved fingerprint on record for ${fingerprint}.`;
  if (runtimeMode === "shadow") {
    return `${base} Shadow mode is active; deploy verification completed successfully.`;
  }
  return base;
}

export function buildNoApprovedBaselineSummary(
  reason: string,
  runtimeMode?: RuntimeMode,
): string {
  const base = reason.trim() || "No approved fingerprint exists for this governed change context.";
  if (runtimeMode === "shadow") {
    return `${base} Shadow mode is active, so this workflow is not blocked by Control9.`;
  }
  return base;
}

export function buildErrorDetailLines(
  outcomeKind:
    | "timeout"
    | "unavailable_api"
    | "malformed_response"
    | "redaction_applied"
    | "fingerprint_mismatch"
    | "verified"
    | "no_approved_baseline",
  options: {
    artifactFingerprint?: string;
    targetEnvironment?: string;
    redactionReport?: RedactionReport;
    expectedFingerprint?: string;
    actualFingerprint?: string;
    detail?: string;
    verificationId?: string;
    decisionId?: string;
    reason?: string;
  },
): string[] {
  const lines: string[] = [];

  if (options.targetEnvironment) {
    lines.push(`Target environment: ${options.targetEnvironment}`);
  }
  if (options.artifactFingerprint) {
    lines.push(`Artifact fingerprint: ${options.artifactFingerprint}`);
  }

  if (
    (outcomeKind === "malformed_response" || outcomeKind === "unavailable_api") &&
    options.detail?.trim()
  ) {
    lines.push(`Response detail: ${options.detail.trim()}`);
  }

  if (outcomeKind === "redaction_applied" && options.redactionReport) {
    const status = formatRedactionStatus(options.redactionReport);
    if (status) {
      lines.push(`Redaction status: ${status}`);
    }
  }

  if (outcomeKind === "fingerprint_mismatch") {
    if (options.expectedFingerprint) {
      lines.push(`Expected fingerprint: ${options.expectedFingerprint}`);
    }
    if (options.actualFingerprint) {
      lines.push(`Actual fingerprint: ${options.actualFingerprint}`);
    }
  }

  if (outcomeKind === "verified" || outcomeKind === "no_approved_baseline") {
    if (options.verificationId) {
      lines.push(`Verification id: ${options.verificationId}`);
    }
    if (options.decisionId) {
      lines.push(`Decision id: ${options.decisionId}`);
    }
    if (outcomeKind === "no_approved_baseline" && options.reason?.trim()) {
      lines.push(`Reason: ${options.reason.trim()}`);
    }
  }

  return lines;
}

export function buildPolicyDetailLines(options: {
  decision: PolicyDecision;
  artifactFingerprint?: string;
  targetEnvironment?: string;
  redactionReport?: RedactionReport;
}): string[] {
  const lines: string[] = [
    `Decision kind: ${options.decision.decisionKind}`,
    `Reason: ${options.decision.reason}`,
  ];

  if (options.decision.riskSummary) {
    lines.push(`Risk summary: ${options.decision.riskSummary}`);
  }
  if (options.decision.policyVersion) {
    lines.push(`Policy version: ${options.decision.policyVersion}`);
  }
  lines.push(`Decision id: ${options.decision.decisionId}`);

  if (options.targetEnvironment) {
    lines.push(`Target environment: ${options.targetEnvironment}`);
  }
  if (options.artifactFingerprint) {
    lines.push(`Artifact fingerprint: ${options.artifactFingerprint}`);
  }

  const redactionStatus = formatRedactionStatus(options.redactionReport);
  if (redactionStatus) {
    lines.push(`Redaction status: ${redactionStatus}`);
  }

  const followUpAction = formatFollowUpAction(options.decision.followUp);
  if (followUpAction) {
    lines.push(`Follow-up action: ${followUpAction}`);
  }

  return lines;
}

export function buildBodyMarkdown(title: string, summary: string, detailLines: string[]): string {
  const sections = [`## ${title}`, "", summary];

  if (detailLines.length > 0) {
    sections.push("", ...detailLines.map((line) => `- ${line}`));
  }

  return sections.join("\n");
}
