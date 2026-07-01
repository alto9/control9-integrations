import { describe, expect, it } from "vitest";

import { buildBaselineLogLines } from "../src/gitlab/log-output";
import { renderDecisionFeedback } from "../src/rendering/decision-renderer";

describe("buildBaselineLogLines", () => {
  it("uses notice prefix for non-blocking outcomes and warning prefix for blocking outcomes", () => {
    const nonBlocking = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        decisionId: "dec-allow",
        decisionKind: "allow",
        reason: "Change approved.",
      },
      runtimeMode: "shadow",
      targetEnvironment: "staging",
    });
    const blocking = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        decisionId: "dec-deny",
        decisionKind: "deny",
        reason: "Policy restriction triggered.",
      },
      runtimeMode: "enforce",
      targetEnvironment: "production",
    });

    expect(buildBaselineLogLines(nonBlocking)[0]).toMatch(/^Control9 NOTICE:/);
    expect(buildBaselineLogLines(blocking)[0]).toMatch(/^Control9 WARNING:/);
  });
});
