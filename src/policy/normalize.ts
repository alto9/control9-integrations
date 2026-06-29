import type { DecisionKind } from "../types";
import { Control9ActionError } from "../types";
import type { PolicyDecision, RawPolicyDecisionResponse } from "../envelope/types";

const ALLOWED_DECISION_KINDS = new Set<Exclude<DecisionKind, "pending">>([
  "allow",
  "deny",
  "require_approval",
  "observe",
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

export function normalizePolicyDecision(
  response: RawPolicyDecisionResponse,
): PolicyDecision {
  const decisionId = readStringField(response, "decisionId", "decision_id");
  const decisionKindRaw = readStringField(response, "decisionKind", "decision_kind");
  const reason = readStringField(response, "reason", "reason");

  if (!decisionId) {
    throw new Control9ActionError("Control9 policy response is missing decision id.");
  }

  if (!decisionKindRaw) {
    throw new Control9ActionError("Control9 policy response is missing decision kind.");
  }

  const normalizedKind = decisionKindRaw.toLowerCase().replace(/-/g, "_");
  if (!ALLOWED_DECISION_KINDS.has(normalizedKind as Exclude<DecisionKind, "pending">)) {
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
    decisionKind: normalizedKind as Exclude<DecisionKind, "pending">,
    reason,
    riskSummary,
    policyVersion,
    followUp,
  };
}
