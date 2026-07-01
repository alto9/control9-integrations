import type { PolicyDecision } from "../envelope/types";
import { Control9ActionError } from "../types";

export type PolicySubmissionFailureKind =
  | "unavailable_api"
  | "timeout"
  | "malformed_response";

export interface PolicySubmissionSuccess {
  status: "success";
  decision: PolicyDecision;
}

export interface PolicySubmissionFailure {
  status: "failure";
  failureKind: PolicySubmissionFailureKind;
  detail?: string;
}

export type PolicySubmissionResult = PolicySubmissionSuccess | PolicySubmissionFailure;

export class PolicySubmissionError extends Error {
  readonly failureKind: PolicySubmissionFailureKind;
  readonly detail?: string;

  constructor(
    failureKind: PolicySubmissionFailureKind,
    message: string,
    detail?: string,
  ) {
    super(message);
    this.name = "PolicySubmissionError";
    this.failureKind = failureKind;
    this.detail = detail;
  }
}

export function isPolicySubmissionError(error: unknown): error is PolicySubmissionError {
  return error instanceof PolicySubmissionError;
}

export function isTimeoutError(error: Error): boolean {
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("etimedout") ||
    message.includes("time out")
  );
}

export function classifySubmissionError(error: unknown): PolicySubmissionFailure {
  if (error instanceof PolicySubmissionError) {
    return {
      status: "failure",
      failureKind: error.failureKind,
      detail: error.detail ?? error.message,
    };
  }

  if (error instanceof Control9ActionError) {
    if (error.message.includes("policy response")) {
      return {
        status: "failure",
        failureKind: "malformed_response",
        detail: error.message,
      };
    }
  }

  if (error instanceof Error && isTimeoutError(error)) {
    return {
      status: "failure",
      failureKind: "timeout",
      detail: error.message,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    status: "failure",
    failureKind: "unavailable_api",
    detail: message,
  };
}

export function toSubmissionResult(
  value: PolicyDecision | PolicySubmissionFailure,
): PolicySubmissionResult {
  if ("status" in value && value.status === "failure") {
    return value;
  }

  return {
    status: "success",
    decision: value as PolicyDecision,
  };
}
