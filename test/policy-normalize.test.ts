import { describe, expect, it } from "vitest";

import {
  normalizePolicyDecision,
  normalizePolicyDecisionResponse,
  projectPolicyDecisionForRuntime,
} from "../src/policy/normalize";
import { Control9ActionError } from "../src/types";

describe("normalizePolicyDecisionResponse", () => {
  it("normalizes snake_case API responses", () => {
    const decision = normalizePolicyDecisionResponse({
      decision_id: "dec-1",
      decision_kind: "require-approval",
      reason: "Production change requires approval.",
      risk_summary: "Creates public resources.",
      policy_version: "2026.06.1",
      follow_up: { approval_url: "https://control9.example/approve/dec-1" },
    });

    expect(decision).toEqual({
      decisionId: "dec-1",
      decisionKind: "require_approval",
      reason: "Production change requires approval.",
      riskSummary: "Creates public resources.",
      policyVersion: "2026.06.1",
      followUp: { approval_url: "https://control9.example/approve/dec-1" },
    });
  });

  it("accepts pending decision kinds from SaaS", () => {
    const decision = normalizePolicyDecisionResponse({
      decision_id: "dec-pending-1",
      decision_kind: "pending",
      reason: "Policy evaluation is still in progress.",
      correlation_id: "corr-saas-123",
    });

    expect(decision).toEqual({
      decisionId: "dec-pending-1",
      decisionKind: "pending",
      reason: "Policy evaluation is still in progress.",
      correlationId: "corr-saas-123",
    });
  });

  it("accepts snake_case pending aliases", () => {
    const decision = normalizePolicyDecisionResponse({
      decisionId: "dec-pending-2",
      decisionKind: "pending",
      reason: "Awaiting policy engine.",
      correlationId: "corr-saas-456",
    });

    expect(decision.decisionKind).toBe("pending");
    expect(decision.correlationId).toBe("corr-saas-456");
  });

  it("rejects malformed responses without retry semantics", () => {
    expect(() => normalizePolicyDecisionResponse({ decision_id: "dec-1" })).toThrow(
      Control9ActionError,
    );
    expect(() => normalizePolicyDecisionResponse({ decision_id: "dec-1" })).toThrow(
      /decision kind/,
    );
  });

  it.each(["allow", "deny", "require_approval", "observe"] as const)(
    "keeps terminal %s decisions unchanged during projection",
    (decisionKind) => {
      const parsed = normalizePolicyDecisionResponse({
        decision_id: "dec-terminal",
        decision_kind: decisionKind,
        reason: `${decisionKind} reason.`,
      });

      expect(projectPolicyDecisionForRuntime(parsed, "shadow")).toEqual({
        decision: {
          decisionId: "dec-terminal",
          decisionKind,
          reason: `${decisionKind} reason.`,
        },
        decisionKindOutput: decisionKind,
        correlationId: undefined,
      });
    },
  );
});

describe("projectPolicyDecisionForRuntime", () => {
  const pendingParsed = normalizePolicyDecisionResponse({
    decision_id: "dec-pending-1",
    decision_kind: "pending",
    reason: "Policy evaluation is still in progress.",
    correlation_id: "corr-saas-123",
  });

  it("projects pending to observe in shadow mode", () => {
    const projected = projectPolicyDecisionForRuntime(pendingParsed, "shadow");

    expect(projected).toEqual({
      decision: {
        decisionId: "dec-pending-1",
        decisionKind: "observe",
        reason: "Policy evaluation is still in progress.",
      },
      decisionKindOutput: "observe",
      correlationId: "corr-saas-123",
    });
  });

  it("fails closed on pending in enforce mode", () => {
    const projected = projectPolicyDecisionForRuntime(pendingParsed, "enforce");

    expect(projected.decisionKindOutput).toBe("deny");
    expect(projected.decision.decisionKind).toBe("deny");
    expect(projected.correlationId).toBe("corr-saas-123");
    expect(projected.decision.reason).toBe("Policy evaluation is still in progress.");
  });
});

describe("normalizePolicyDecision", () => {
  it("rejects pending for legacy terminal normalization", () => {
    expect(() =>
      normalizePolicyDecision({
        decision_id: "dec-pending-1",
        decision_kind: "pending",
        reason: "Pending.",
      }),
    ).toThrow(/pending/);
  });
});
