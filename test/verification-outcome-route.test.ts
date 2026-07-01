import { describe, expect, it } from "vitest";

import { routeVerificationSubmissionOutcome } from "../src/outcomes/route";

const baseRouteOptions = {
  artifactFingerprint: "fp-current",
  targetEnvironment: "production",
  failOpenEnvironments: [] as string[],
};

describe("routeVerificationSubmissionOutcome", () => {
  it.each([
    "verified",
    "fingerprint_mismatch",
    "no_approved_baseline",
  ] as const)("routes successful %s verification outcomes", (verificationStatus) => {
    const routed = routeVerificationSubmissionOutcome({
      submission: {
        status: "success",
        verification: {
          verificationId: `verify-${verificationStatus}`,
          verificationStatus,
          reason:
            verificationStatus === "no_approved_baseline"
              ? "No approved fingerprint exists."
              : undefined,
          expectedFingerprint:
            verificationStatus === "fingerprint_mismatch" ? "fp-approved" : undefined,
          actualFingerprint:
            verificationStatus === "fingerprint_mismatch" ? "fp-current" : undefined,
        },
      },
      ...baseRouteOptions,
      runtimeMode: "shadow",
    });

    expect(routed.renderInput.kind).toBe(verificationStatus);
    expect(routed.verificationStatusOutput).toBe(verificationStatus);
  });

  it.each([
    ["fingerprint_mismatch", "shadow", false],
    ["fingerprint_mismatch", "enforce", true],
    ["no_approved_baseline", "shadow", false],
    ["no_approved_baseline", "enforce", true],
    ["verified", "enforce", false],
  ] as const)(
    "sets blocking for %s in %s mode to %s",
    (verificationStatus, runtimeMode, blocksWorkflow) => {
      const routed = routeVerificationSubmissionOutcome({
        submission: {
          status: "success",
          verification: {
            verificationId: "verify-001",
            verificationStatus,
            reason:
              verificationStatus === "no_approved_baseline"
                ? "No approved fingerprint exists."
                : undefined,
            expectedFingerprint:
              verificationStatus === "fingerprint_mismatch" ? "fp-approved" : undefined,
            actualFingerprint:
              verificationStatus === "fingerprint_mismatch" ? "fp-current" : undefined,
          },
        },
        ...baseRouteOptions,
        runtimeMode,
      });

      expect(routed.blocksWorkflow).toBe(blocksWorkflow);
      expect(routed.rendered.blocksWorkflow).toBe(blocksWorkflow);
    },
  );

  it.each([
    ["unavailable_api", "shadow", false],
    ["unavailable_api", "enforce", true],
    ["timeout", "shadow", false],
    ["timeout", "enforce", true],
    ["malformed_response", "shadow", true],
    ["malformed_response", "enforce", true],
  ] as const)(
    "routes verification API failure %s in %s mode with blocking=%s",
    (failureKind, runtimeMode, blocksWorkflow) => {
      const routed = routeVerificationSubmissionOutcome({
        submission: {
          status: "failure",
          failureKind,
          detail: `${failureKind} detail`,
        },
        ...baseRouteOptions,
        runtimeMode,
      });

      expect(routed.renderInput.kind).toBe(failureKind);
      expect(routed.verificationStatusOutput).toBe(failureKind);
      expect(routed.blocksWorkflow).toBe(blocksWorkflow);
    },
  );

  it("does not block enforce-mode unavailable_api when target environment is fail-open", () => {
    const routed = routeVerificationSubmissionOutcome({
      submission: {
        status: "failure",
        failureKind: "unavailable_api",
        detail: "HTTP 503",
      },
      ...baseRouteOptions,
      targetEnvironment: "staging",
      runtimeMode: "enforce",
      failOpenEnvironments: ["staging"],
    });

    expect(routed.blocksWorkflow).toBe(false);
    expect(routed.rendered.summary).toMatch(/configured to fail open on API unavailability/i);
  });
});
