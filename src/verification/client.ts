import type { ActionEnvelope } from "../envelope/types";
import { isTimeoutError } from "../policy/submission";
import { normalizeDeployVerification } from "./normalize";
import {
  VerificationSubmissionError,
  type VerificationSubmissionResult,
} from "./submission";

export interface VerificationClientOptions {
  apiBaseUrl: string;
  maxAttempts?: number;
  initialBackoffMs?: number;
  fetchImpl?: typeof fetch;
}

export interface SubmitVerificationRequest {
  envelope: ActionEnvelope;
  apiToken?: string;
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

function buildVerificationUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/v1/deploy-verifications`;
}

export class Control9VerificationClient {
  private readonly apiBaseUrl: string;
  private readonly maxAttempts: number;
  private readonly initialBackoffMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VerificationClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.initialBackoffMs = options.initialBackoffMs ?? 100;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async submitVerificationWithOutcome(
    request: SubmitVerificationRequest,
  ): Promise<VerificationSubmissionResult> {
    const url = buildVerificationUrl(this.apiBaseUrl);
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...(request.apiToken ? { authorization: `Bearer ${request.apiToken}` } : {}),
          },
          body: JSON.stringify(request.envelope),
        });

        if (!response.ok) {
          if (isRetryableStatus(response.status) && attempt < this.maxAttempts) {
            await sleep(this.initialBackoffMs * 2 ** (attempt - 1));
            continue;
          }

          return {
            status: "failure",
            failureKind: "unavailable_api",
            detail: `Control9 verification API returned HTTP ${response.status} for deploy verification submission.`,
          };
        }

        try {
          const payload = (await response.json()) as Record<string, unknown>;
          const verification = normalizeDeployVerification(payload);
          return { status: "success", verification };
        } catch (error) {
          const detail =
            error instanceof Error
              ? error.message
              : "Control9 verification response could not be normalized.";
          return {
            status: "failure",
            failureKind: "malformed_response",
            detail,
          };
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxAttempts) {
          await sleep(this.initialBackoffMs * 2 ** (attempt - 1));
          continue;
        }
      }
    }

    if (lastError && isTimeoutError(lastError)) {
      return {
        status: "failure",
        failureKind: "timeout",
        detail: lastError.message,
      };
    }

    return {
      status: "failure",
      failureKind: "unavailable_api",
      detail: `Control9 verification API submission failed after ${this.maxAttempts} attempts: ${lastError?.message ?? "unknown error"}.`,
    };
  }

  async submitVerification(request: SubmitVerificationRequest) {
    const result = await this.submitVerificationWithOutcome(request);
    if (result.status === "failure") {
      throw new VerificationSubmissionError(
        result.failureKind,
        result.detail ?? `Control9 verification submission failed (${result.failureKind}).`,
        result.detail,
      );
    }

    return result.verification;
  }
}

export function createVerificationClient(
  options: VerificationClientOptions,
): Control9VerificationClient {
  return new Control9VerificationClient(options);
}
