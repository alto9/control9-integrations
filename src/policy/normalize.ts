import type { DecisionKind, OutputDecisionKind, RuntimeMode } from "../types";
import { Control9ActionError } from "../types";
import type { PolicyDecision, RawPolicyDecisionResponse } from "../envelope/types";

const TERMINAL_DECISION_KINDS = new Set<Exclude<DecisionKind, "pending">>([
  "allow",
  "deny",
  "require_approval",
  "observe",
]);

const INCOMING_DECISION_KINDS = new Set<DecisionKind>([
  ...TERMINAL_DECISION_KINDS,
  "pending",
]);

function readStringField(
  response: RawPolicyDecisionResponse,
  camelCase: keyof RawPolicyDecisionResponse,
  snakeCase: keyof RawPolicyDecisionResponse,
): string | undefined {
  const camelValue = response[camelCase];
  if (typeof camelValue === "string" && camelValue.trim()) {
    return camelValue.trim();
  }
  const snakeValue = response[snakeCase];
  if (typeof snakeValue === "string" && snakeValue.trim()) {
    return snakeValue.trim();
  }
  return undefined;
}

export interface ParsedPolicyDecision {
  decisionId: string;
  decisionKind: DecisionKind;
  reason: string;
  correlationId?: string;
  riskSummary?: string;
  policyVersion?: string;
  followUp?: Record<string, unknown>;
}

export interface ProjectedPolicyDecision {
  decision: PolicyDecision;
  decisionKindOutput: OutputDecisionKind;
  correlationId?: string;
}

export function normalizePolicyDecisionResponse(
  response: RawPolicyDecisionResponse,
): ParsedPolicyDecision {
  const decisionId = readStringField(response, "decisionId", "decision_id");
  const decisionKindRaw = readStringField(response, "decisionKind", "decision_kind");
  const reason = readStringField(response, "reason", "reason");
  const correlationId = readStringField(response, "correlationId", "correlation_id");

  if (!decisionId) {
    throw new Control9ActionError("Control9 policy response is missing decision id.");
  }

  if (!decisionKindRaw) {
    throw new Control9ActionError("Control9 policy response is missing decision kind.");
  }

  const normalizedKind = decisionKindRaw.toLowerCase().replace(/-/g, "_") as DecisionKind;
  if (!INCOMING_DECISION_KINDS.has(normalizedKind)) {
    throw new Control9ActionError(
      `Unsupported Control9 decision kind "${decisionKindRaw}".`,
    );
  }

  if (!reason) {
    throw new Control9ActionError("Control9 policy response is missing reason text.");
  }

  const riskSummary = readStringField(response, "riskSummary", "risk_summary");
  const policyVersion = readStringField(response, "policyVersion", "policy_version");
  const followUp = response.followUp ?? response.follow_up;

  return {
    decisionId,
    decisionKind: normalizedKind,
    reason,
    correlationId,
    riskSummary,
    policyVersion,
    followUp,
  };
}

export function projectPolicyDecisionForRuntime(
  parsed: ParsedPolicyDecision,
  runtimeMode: RuntimeMode,
): ProjectedPolicyDecision {
  if (parsed.decisionKind !== "pending") {
    return {
      decision: {
        decisionId: parsed.decisionId,
        decisionKind: parsed.decisionKind,
        reason: parsed.reason,
        riskSummary: parsed.riskSummary,
        policyVersion: parsed.policyVersion,
        followUp: parsed.followUp,
      },
      decisionKindOutput: parsed.decisionKind,
      correlationId: parsed.correlationId,
    };
  }

  if (runtimeMode === "shadow") {
    return {
      decision: {
        decisionId: parsed.decisionId,
        decisionKind: "observe",
        reason: parsed.reason,
        riskSummary: parsed.riskSummary,
        policyVersion: parsed.policyVersion,
        followUp: parsed.followUp,
      },
      decisionKindOutput: "observe",
      correlationId: parsed.correlationId,
    };
  }

  return {
    decision: {
      decisionId: parsed.decisionId,
      decisionKind: "deny",
      reason: parsed.reason,
      riskSummary: parsed.riskSummary,
      policyVersion: parsed.policyVersion,
      followUp: parsed.followUp,
    },
    decisionKindOutput: "deny",
    correlationId: parsed.correlationId,
  };
}

/** @deprecated Use {@link normalizePolicyDecisionResponse} */
export function normalizePolicyDecision(
  response: RawPolicyDecisionResponse,
): PolicyDecision {
  const parsed = normalizePolicyDecisionResponse(response);
  if (parsed.decisionKind === "pending") {
    throw new Control9ActionError(
      `Unsupported Control9 decision kind "pending".`,
    );
  }

  return {
    decisionId: parsed.decisionId,
    decisionKind: parsed.decisionKind,
    reason: parsed.reason,
    riskSummary: parsed.riskSummary,
    policyVersion: parsed.policyVersion,
    followUp: parsed.followUp,
  };
}
