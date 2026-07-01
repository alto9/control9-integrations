import { Control9ActionError } from "../types";
import type { DeployVerification, RawDeployVerificationResponse, VerificationStatus } from "./types";

const ALLOWED_VERIFICATION_STATUSES = new Set<VerificationStatus>([
  "verified",
  "fingerprint_mismatch",
  "no_approved_baseline",
]);

function readStringField(
  response: RawDeployVerificationResponse,
  camelCase: keyof RawDeployVerificationResponse,
  snakeCase: keyof RawDeployVerificationResponse,
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

export function normalizeDeployVerification(
  response: RawDeployVerificationResponse,
): DeployVerification {
  const verificationId = readStringField(response, "verificationId", "verification_id");
  const verificationStatusRaw = readStringField(
    response,
    "verificationStatus",
    "verification_status",
  );

  if (!verificationId) {
    throw new Control9ActionError("Control9 verification response is missing verification id.");
  }

  if (!verificationStatusRaw) {
    throw new Control9ActionError(
      "Control9 verification response is missing verification status.",
    );
  }

  const normalizedStatus = verificationStatusRaw.toLowerCase().replace(/-/g, "_");
  if (!ALLOWED_VERIFICATION_STATUSES.has(normalizedStatus as VerificationStatus)) {
    throw new Control9ActionError(
      `Unsupported Control9 verification status "${verificationStatusRaw}".`,
    );
  }

  const verificationStatus = normalizedStatus as VerificationStatus;
  const decisionId = readStringField(response, "decisionId", "decision_id");
  const expectedFingerprint = readStringField(
    response,
    "expectedFingerprint",
    "expected_fingerprint",
  );
  const actualFingerprint = readStringField(response, "actualFingerprint", "actual_fingerprint");
  const reason = readStringField(response, "reason", "reason");

  if (verificationStatus === "no_approved_baseline" && !reason) {
    throw new Control9ActionError(
      "Control9 verification response is missing reason text for no_approved_baseline.",
    );
  }

  return {
    verificationId,
    verificationStatus,
    decisionId,
    expectedFingerprint,
    actualFingerprint,
    reason,
  };
}
