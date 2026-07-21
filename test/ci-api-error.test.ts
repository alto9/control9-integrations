import { describe, expect, it } from "vitest";

import { formatCiApiFailureDetail, readCiApiErrorDetails } from "../src/http/ci-api-error";

describe("readCiApiErrorDetails", () => {
  it("parses flat CI ingestion error JSON", async () => {
    const response = Response.json(
      {
        code: "invalid_signature",
        message: "envelope signature verification failed",
        correlationId: "corr-1",
      },
      { status: 401 },
    );

    await expect(readCiApiErrorDetails(response)).resolves.toEqual({
      httpStatus: 401,
      code: "invalid_signature",
      message: "envelope signature verification failed",
      correlationId: "corr-1",
    });
  });

  it("accepts snake_case correlation_id", async () => {
    const response = Response.json(
      {
        code: "unknown_repository",
        message: "repository not configured",
        correlation_id: "corr-2",
      },
      { status: 404 },
    );

    const details = await readCiApiErrorDetails(response);
    expect(details.correlationId).toBe("corr-2");
    expect(details.code).toBe("unknown_repository");
  });
});

describe("formatCiApiFailureDetail", () => {
  it.each([
    [
      "invalid_signature",
      401,
      "CONTROL9_SIGNING_SECRET",
    ],
    [
      "unknown_repository",
      404,
      "protected repository",
    ],
    [
      "unknown_environment",
      404,
      "target-environment",
    ],
    [
      "entitlement_required",
      403,
      "entitlement",
    ],
  ] as const)("includes actionable guidance for %s", (code, status, hint) => {
    const detail = formatCiApiFailureDetail("policy", {
      httpStatus: status,
      code,
      message: `${code} message`,
    });

    expect(detail).toContain(`HTTP ${status}`);
    expect(detail).toContain(`code=${code}`);
    expect(detail).toContain(`${code} message`);
    expect(detail).toMatch(new RegExp(hint, "i"));
  });
});
