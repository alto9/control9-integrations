import { describe, expect, it } from "vitest";

import { Control9ActionError } from "../src/types";
import { normalizeDeployVerification } from "../src/verification/normalize";

describe("normalizeDeployVerification", () => {
  it("normalizes verified responses with snake_case fields", () => {
    const verification = normalizeDeployVerification({
      verification_id: "verify-001",
      verification_status: "verified",
      decision_id: "dec-approved-001",
    });

    expect(verification).toEqual({
      verificationId: "verify-001",
      verificationStatus: "verified",
      decisionId: "dec-approved-001",
      expectedFingerprint: undefined,
      actualFingerprint: undefined,
      reason: undefined,
    });
  });

  it("normalizes fingerprint mismatch responses", () => {
    const verification = normalizeDeployVerification({
      verificationId: "verify-mismatch",
      verificationStatus: "fingerprint_mismatch",
      expectedFingerprint: "fp-approved",
      actualFingerprint: "fp-current",
    });

    expect(verification.verificationStatus).toBe("fingerprint_mismatch");
    expect(verification.expectedFingerprint).toBe("fp-approved");
    expect(verification.actualFingerprint).toBe("fp-current");
  });

  it("requires reason text for no_approved_baseline", () => {
    expect(() =>
      normalizeDeployVerification({
        verification_id: "verify-no-baseline",
        verification_status: "no_approved_baseline",
      }),
    ).toThrow(Control9ActionError);
  });

  it("rejects unsupported verification statuses", () => {
    expect(() =>
      normalizeDeployVerification({
        verification_id: "verify-bad",
        verification_status: "pending",
      }),
    ).toThrow(/Unsupported Control9 verification status/);
  });
});
