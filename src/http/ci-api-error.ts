/**
 * Parse and explain Control9 CI ingestion HTTP error responses.
 *
 * Non-2xx policy/verification responses often carry a stable `code` (for example
 * `invalid_signature` or `unknown_repository`). The client previously folded those
 * into a generic "could not reach the API" summary; this module keeps the HTTP
 * status and maps known codes to actionable guidance.
 */

export interface CiApiErrorDetails {
  httpStatus: number;
  code?: string;
  message?: string;
  correlationId?: string;
}

const CODE_GUIDANCE: Readonly<Record<string, string>> = {
  invalid_envelope:
    "The submitted action envelope failed Control9 schema validation. Check integration version compatibility and artifact inputs.",
  invalid_signature:
    "Envelope signature verification failed or the keyId is unknown for this tenant. Confirm CONTROL9_SIGNING_SECRET matches the active signing secret generated in Control9 admin for CONTROL9_TENANT_ID.",
  stale_signature:
    "The envelope signedAt timestamp is outside the allowed freshness window. Check GitHub Actions runner clock skew and rerun the job.",
  entitlement_required:
    "The tenant is missing a current entitlement required for ingestion. Complete billing or entitlement setup in Control9 admin.",
  unknown_repository:
    "The repository is not registered as a protected repository for this tenant. Register the GitHub repository (owner/name) in Control9 admin.",
  unknown_environment:
    "The target environment key is not registered for this repository. Register the environment key that matches target-environment in Control9 admin.",
  runtime_mode_rejected:
    "The envelope runtime mode is not allowed for this environment configuration.",
  redaction_unsafe:
    "The envelope failed Control9 redaction safety checks before acceptance.",
};

function readOptionalString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

/** Read status plus optional flat CI error body fields from a failed Response. */
export async function readCiApiErrorDetails(response: Response): Promise<CiApiErrorDetails> {
  const httpStatus = response.status;
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    return { httpStatus };
  }

  if (!bodyText.trim()) {
    return { httpStatus };
  }

  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { httpStatus, message: bodyText.slice(0, 300) };
    }

    const record = parsed as Record<string, unknown>;
    return {
      httpStatus,
      code: readOptionalString(record, "code"),
      message: readOptionalString(record, "message"),
      correlationId: readOptionalString(record, "correlationId", "correlation_id"),
    };
  } catch {
    return { httpStatus, message: bodyText.slice(0, 300) };
  }
}

/** Build a single-line failure detail suitable for workflow summaries. */
export function formatCiApiFailureDetail(
  apiName: "policy" | "verification",
  details: CiApiErrorDetails,
): string {
  const statusPart = details.code
    ? `Control9 ${apiName} API returned HTTP ${details.httpStatus} (code=${details.code}).`
    : `Control9 ${apiName} API returned HTTP ${details.httpStatus}.`;

  const parts = [statusPart];

  if (details.message) {
    parts.push(details.message);
  }

  if (details.code && CODE_GUIDANCE[details.code]) {
    parts.push(CODE_GUIDANCE[details.code]);
  } else if (!details.code && details.httpStatus >= 500) {
    parts.push(
      "This looks like a Control9 service or dependency failure. Check Control9 service status and retry.",
    );
  } else if (!details.code && details.httpStatus >= 400) {
    parts.push(
      "This is a non-retryable client or authorization response from Control9, not a network outage.",
    );
  }

  if (details.correlationId) {
    parts.push(`Correlation id: ${details.correlationId}.`);
  }

  return parts.join(" ");
}
