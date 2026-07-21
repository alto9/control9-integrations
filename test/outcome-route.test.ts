import { describe, expect, it } from "vitest";

import type { RedactionReport } from "../src/envelope/types";
import type { ParsedPolicyDecision } from "../src/policy/normalize";
import { routePolicySubmissionOutcome } from "../src/outcomes/route";

const redactionReport: RedactionReport = {
  profile: "default",
  totalRedactions: 0,
  markers: [],
};

const baseRouteOptions = {
  artifactFingerprint: "fp-abc123",
  targetEnvironment: "staging",
  redactionReport,
  failOpenEnvironments: [] as string[],
};

const baseDecision: ParsedPolicyDecision = {
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
      ...baseRouteOptions,
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
        ...baseRouteOptions,
        targetEnvironment: "production",
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
      ...baseRouteOptions,
      runtimeMode: "enforce",
    });
    const unavailable = routePolicySubmissionOutcome({
      submission: {
        status: "failure",
        failureKind: "unavailable_api",
        detail: "HTTP 503",
      },
      ...baseRouteOptions,
      runtimeMode: "enforce",
    });

    expect(malformed.rendered.label).not.toBe(unavailable.rendered.label);
    expect(malformed.rendered.title).not.toBe(unavailable.rendered.title);
    expect(malformed.rendered.summary).toMatch(/could not be normalized/i);
    expect(unavailable.rendered.summary).toMatch(/HTTP 503/);
  });

  it("surfaces API rejection detail for unavailable_api outcomes", () => {
    const routed = routePolicySubmissionOutcome({
      submission: {
        status: "failure",
        failureKind: "unavailable_api",
        detail:
          "Control9 policy API returned HTTP 404 (code=unknown_repository). repository not configured. Register the GitHub repository.",
      },
      ...baseRouteOptions,
      runtimeMode: "shadow",
    });

    expect(routed.summaryMessage).toMatch(/code=unknown_repository/);
    expect(routed.summaryMessage).toMatch(/Register the GitHub repository/);
    expect(routed.summaryMessage).toMatch(/Shadow mode is active/);
    expect(routed.summaryMessage).not.toMatch(/could not reach the policy API/i);
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
      ...baseRouteOptions,
      targetEnvironment: "production",
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
      ...baseRouteOptions,
      targetEnvironment: "production",
      runtimeMode: "enforce",
    });

    expect(routed.blocksWorkflow).toBe(true);
  });

  it("projects pending to observe in shadow mode without blocking", () => {
    const routed = routePolicySubmissionOutcome({
      submission: {
        status: "success",
        decision: {
          decisionId: "dec-pending-1",
          decisionKind: "pending",
          reason: "Policy evaluation is still in progress.",
          correlationId: "corr-saas-123",
        },
      },
      ...baseRouteOptions,
      runtimeMode: "shadow",
    });

    expect(routed.renderInput.kind).toBe("policy_decision");
    if (routed.renderInput.kind === "policy_decision") {
      expect(routed.renderInput.decision.decisionKind).toBe("observe");
    }
    expect(routed.decisionKindOutput).toBe("observe");
    expect(routed.correlationId).toBe("corr-saas-123");
    expect(routed.blocksWorkflow).toBe(false);
  });

  it("fails closed on pending in enforce mode", () => {
    const routed = routePolicySubmissionOutcome({
      submission: {
        status: "success",
        decision: {
          decisionId: "dec-pending-1",
          decisionKind: "pending",
          reason: "Policy evaluation is still in progress.",
          correlationId: "corr-saas-123",
        },
      },
      ...baseRouteOptions,
      targetEnvironment: "production",
      runtimeMode: "enforce",
    });

    expect(routed.decisionKindOutput).toBe("deny");
    expect(routed.blocksWorkflow).toBe(true);
    expect(routed.correlationId).toBe("corr-saas-123");
  });

  it.each([
    ["unavailable_api", "staging", ["staging"], false],
    ["timeout", "dev", ["staging", "dev"], false],
  ] as const)(
    "does not block enforce-mode %s when target environment is in fail-open list",
    (failureKind, targetEnvironment, failOpenEnvironments, blocksWorkflow) => {
      const routed = routePolicySubmissionOutcome({
        submission: {
          status: "failure",
          failureKind,
          detail: `${failureKind} detail`,
        },
        ...baseRouteOptions,
        targetEnvironment,
        runtimeMode: "enforce",
        failOpenEnvironments,
      });

      expect(routed.blocksWorkflow).toBe(blocksWorkflow);
      expect(routed.rendered.summary).toMatch(/configured to fail open on API unavailability/i);
    },
  );
});
