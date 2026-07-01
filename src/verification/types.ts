export type VerificationStatus = "verified" | "fingerprint_mismatch" | "no_approved_baseline";

export interface RawDeployVerificationResponse {
  verificationId?: string;
  verification_id?: string;
  verificationStatus?: string;
  verification_status?: string;
  decisionId?: string;
  decision_id?: string;
  expectedFingerprint?: string;
  expected_fingerprint?: string;
  actualFingerprint?: string;
  actual_fingerprint?: string;
  reason?: string;
}

export interface DeployVerification {
  verificationId: string;
  verificationStatus: VerificationStatus;
  decisionId?: string;
  expectedFingerprint?: string;
  actualFingerprint?: string;
  reason?: string;
}
