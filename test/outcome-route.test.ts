import { describe, expect, it } from "vitest";

import type { PolicyDecision, RedactionReport } from "../src/envelope/types";
import { routePolicySubmissionOutcome } from "../src/outcomes/route";

const redactionReport: RedactionReport = {
  profile: "default",
  totalRedactions: 0,
  markers: [],
};

const baseDecision: PolicyDecision = {
  decisionId: "dec-allow-1",
  decisionKind: "allow",
  reason: "Allowed by policy.",
};

describe("routePolicySubmissionOutcome", () => {
  it.each([
    "allow",
    "deny",
    "require_approval",
    "observe",
  ] as const)("routes successful %s policy decisions", (decisionKind) => {
    const routed = routePolicySubmissionOutcome({
      submission: {
        status: "success",
        decision: {
          ...baseDecision,
          decisionKind,
          reason: `${decisionKind} reason.`,
        },
      },
      artifactFingerprint: "fp-abc123",
      targetEnvironment: "staging",
      redactionReport,
      runtimeMode: "shadow",
    });

    expect(routed.renderInput.kind).toBe("policy_decision");
    expect(routed.decisionKindOutput).toBe(decisionKind);
    expect(routed.summaryMessage).toBe(`${decisionKind} reason.`);
  });

  it.each([
    ["unavailable_api", "shadow", false],
    ["unavailable_api", "enforce", true],
    ["timeout", "shadow", false],
    ["timeout", "enforce", true],
    ["malformed_response", "shadow", true],
    ["malformed_response", "enforce", true],
  ] as const)(
    "sets blocking for %s in %s mode to %s",
    (failureKind, runtimeMode, blocksWorkflow) => {
      const routed = routePolicySubmissionOutcome({
        submission: {
          status: "failure",
          failureKind,
          detail: `${failureKind} detail`,
        },
        artifactFingerprint: "fp-abc123",
        targetEnvironment: "production",
        redactionReport,
        runtimeMode,
      });

      expect(routed.renderInput.kind).toBe(failureKind);
      expect(routed.decisionKindOutput).toBe(failureKind);
      expect(routed.blocksWorkflow).toBe(blocksWorkflow);
      expect(routed.rendered.blocksWorkflow).toBe(blocksWorkflow);
    },
  );

  it("uses distinct render kinds for malformed_response vs unavailable_api", () => {
    const malformed = routePolicySubmissionOutcome({
      submission: {
        status: "failure",
        failureKind: "malformed_response",
        detail: "missing decision id",
      },
      artifactFingerprint: "fp-1",
      targetEnvironment: "staging",
      redactionReport,
      runtimeMode: "enforce",
    });
    const unavailable = routePolicySubmissionOutcome({
      submission: {
        status: "failure",
        failureKind: "unavailable_api",
        detail: "HTTP 503",
      },
      artifactFingerprint: "fp-1",
      targetEnvironment: "staging",
      redactionReport,
      runtimeMode: "enforce",
    });

    expect(malformed.rendered.label).not.toBe(unavailable.rendered.label);
    expect(malformed.rendered.title).not.toBe(unavailable.rendered.title);
    expect(malformed.rendered.summary).toMatch(/could not be normalized/i);
    expect(unavailable.rendered.summary).toMatch(/could not reach the policy API/i);
  });

  it("does not block deny decisions in shadow mode", () => {
    const routed = routePolicySubmissionOutcome({
      submission: {
        status: "success",
        decision: {
          ...baseDecision,
          decisionKind: "deny",
          reason: "Denied.",
        },
      },
      artifactFingerprint: "fp-deny",
      targetEnvironment: "production",
      redactionReport,
      runtimeMode: "shadow",
    });

    expect(routed.blocksWorkflow).toBe(false);
  });

  it("blocks deny decisions in enforce mode", () => {
    const routed = routePolicySubmissionOutcome({
      submission: {
        status: "success",
        decision: {
          ...baseDecision,
          decisionKind: "deny",
          reason: "Denied.",
        },
      },
      artifactFingerprint: "fp-deny",
      targetEnvironment: "production",
      redactionReport,
      runtimeMode: "enforce",
    });

    expect(routed.blocksWorkflow).toBe(true);
  });
});
