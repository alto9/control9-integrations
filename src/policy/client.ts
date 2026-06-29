import type { ActionEnvelope } from "../envelope/types";
import { Control9ActionError } from "../types";
import type { PolicyDecision } from "../envelope/types";
import { normalizePolicyDecision } from "./normalize";

export interface PolicyClientOptions {
  apiBaseUrl: string;
  maxAttempts?: number;
  initialBackoffMs?: number;
  fetchImpl?: typeof fetch;
}

export interface SubmitEnvelopeRequest {
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

function buildSubmissionUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/v1/action-envelopes`;
}

export class Control9PolicyClient {
  private readonly apiBaseUrl: string;
  private readonly maxAttempts: number;
  private readonly initialBackoffMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PolicyClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.initialBackoffMs = options.initialBackoffMs ?? 100;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async submitEnvelope(request: SubmitEnvelopeRequest): Promise<PolicyDecision> {
    const url = buildSubmissionUrl(this.apiBaseUrl);
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

          throw new Control9ActionError(
            `Control9 policy API returned HTTP ${response.status} for envelope submission.`,
          );
        }

        const payload = (await response.json()) as Record<string, unknown>;
        return normalizePolicyDecision(payload);
      } catch (error) {
        if (error instanceof Control9ActionError) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxAttempts) {
          await sleep(this.initialBackoffMs * 2 ** (attempt - 1));
          continue;
        }
      }
    }

    throw new Control9ActionError(
      `Control9 policy API submission failed after ${this.maxAttempts} attempts: ${lastError?.message ?? "unknown error"}.`,
    );
  }
}

export function createPolicyClient(options: PolicyClientOptions): Control9PolicyClient {
  return new Control9PolicyClient(options);
}
