import { describe, expect, it } from "vitest";

import { normalizePolicyDecision } from "../src/policy/normalize";
import { Control9ActionError } from "../src/types";

describe("normalizePolicyDecision", () => {
  it("normalizes snake_case API responses", () => {
    const decision = normalizePolicyDecision({
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

  it("rejects malformed responses without retry semantics", () => {
    expect(() => normalizePolicyDecision({ decision_id: "dec-1" })).toThrow(
      Control9ActionError,
    );
    expect(() => normalizePolicyDecision({ decision_id: "dec-1" })).toThrow(
      /decision kind/,
    );
  });
});
