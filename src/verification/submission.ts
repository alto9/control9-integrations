import type { DeployVerification } from "./types";

export type VerificationSubmissionFailureKind =
  | "unavailable_api"
  | "timeout"
  | "malformed_response";

export interface VerificationSubmissionSuccess {
  status: "success";
  verification: DeployVerification;
}

export interface VerificationSubmissionFailure {
  status: "failure";
  failureKind: VerificationSubmissionFailureKind;
  detail?: string;
}

export type VerificationSubmissionResult =
  | VerificationSubmissionSuccess
  | VerificationSubmissionFailure;

export class VerificationSubmissionError extends Error {
  readonly failureKind: VerificationSubmissionFailureKind;
  readonly detail?: string;

  constructor(
    failureKind: VerificationSubmissionFailureKind,
    message: string,
    detail?: string,
  ) {
    super(message);
    this.name = "VerificationSubmissionError";
    this.failureKind = failureKind;
    this.detail = detail;
  }
}
