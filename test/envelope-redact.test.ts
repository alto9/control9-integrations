import { describe, expect, it } from "vitest";

import sampleSecret from "../fixtures/redaction/sample-secret.json";
import {
  containsRawSecretMarkers,
  redactPayload,
} from "../src/envelope/redact";

describe("redactPayload", () => {
  it("redacts AWS access keys with explicit markers", () => {
    const { redacted, report } = redactPayload(
      { accessKey: sampleSecret.input },
      "standard",
    );

    expect(redacted).toEqual({ accessKey: sampleSecret.expectedMarker });
    expect(report.markers).toEqual([
      {
        marker: sampleSecret.expectedMarker,
        valueClass: "AWS_ACCESS_KEY",
        count: 1,
      },
    ]);
    expect(report.totalRedactions).toBe(1);
    expect(containsRawSecretMarkers(redacted)).toBe(false);
  });

  it("preserves field presence and counts repeated matches", () => {
    const { redacted, report } = redactPayload(
      {
        first: "AKIAIOSFODNN7EXAMPLE",
        second: "AKIAIOSFODNN7EXAMPLE",
      },
      "standard",
    );

    expect(redacted).toEqual({
      first: "[REDACTED:AWS_ACCESS_KEY]",
      second: "[REDACTED:AWS_ACCESS_KEY]",
    });
    expect(report.markers[0]?.count).toBe(2);
  });

  it("applies additional regex patterns", () => {
    const { redacted, report } = redactPayload(
      { note: "project-alpha-secret-value" },
      "standard",
      ["project-[a-z-]+-secret-value"],
    );

    expect(redacted).toEqual({ note: "[REDACTED:CUSTOM_1]" });
    expect(report.totalRedactions).toBe(1);
  });
});
