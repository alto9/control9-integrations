import { describe, expect, it } from "vitest";

import {
  buildUnsignedEnvelopeId,
  signEnvelope,
  verifyEnvelopeSignature,
} from "../src/envelope/sign";
import { ENVELOPE_SCHEMA_VERSION, type UnsignedActionEnvelope } from "../src/envelope/types";
import { canonicalizeJson } from "../src/envelope/serialize";

const unsignedEnvelope: UnsignedActionEnvelope = {
  schemaVersion: ENVELOPE_SCHEMA_VERSION,
  envelopeId: "placeholder",
  correlationId: "run-1:1",
  providerContext: { provider: "github", eventName: "pull_request" },
  runIdentity: {
    runId: "123",
    runAttempt: "1",
    workflow: "control9",
    job: "evaluate",
  },
  tenantIdentity: { tenantId: "tenant-123" },
  repositoryIdentity: {
    owner: "acme",
    name: "infra",
    fullName: "acme/infra",
  },
  refOrPullRequestIdentity: {
    ref: "refs/heads/main",
    sha: "abc123",
  },
  actorIdentity: { login: "dev", actorType: "User" },
  commandCategory: "plan",
  iacTool: "terraform",
  environment: "staging",
  requestedAuthority: "plan",
  runtimeMode: "shadow",
  normalizedChangeSummary: {
    summaryKind: "terraform-plan",
    commandCategory: "plan",
    iacTool: "terraform",
    artifactCount: 1,
    resourceActionCounts: { create: 1 },
  },
  redactionReport: {
    profile: "standard",
    markers: [],
    totalRedactions: 0,
  },
  artifactFingerprints: [
    {
      path: "fixtures/terraform/plan.json",
      fingerprint: "a".repeat(64),
    },
  ],
};

describe("signEnvelope", () => {
  it("signs the canonical unsigned payload", () => {
    const { envelopeId: _ignored, ...unsignedBody } = unsignedEnvelope;
    void _ignored;
    const envelopeId = buildUnsignedEnvelopeId(unsignedBody);
    const unsigned = { ...unsignedBody, envelopeId };
    const signed = signEnvelope(unsigned, "test-signing-secret", "2026-06-29T00:00:00.000Z");

    expect(signed.signature.algorithm).toBe("hmac-sha256");
    expect(signed.signature.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyEnvelopeSignature(signed, "test-signing-secret")).toBe(true);
    expect(verifyEnvelopeSignature(signed, "other-secret")).toBe(false);
  });

  it("changes the signature when the normalized payload changes", () => {
    const { envelopeId: _ignored, ...unsignedBody } = unsignedEnvelope;
    void _ignored;
    const envelopeId = buildUnsignedEnvelopeId(unsignedBody);
    const first = signEnvelope(
      { ...unsignedBody, envelopeId },
      "test-signing-secret",
      "2026-06-29T00:00:00.000Z",
    );
    const changedBody = { ...unsignedBody, environment: "production" };
    const second = signEnvelope(
      {
        ...changedBody,
        envelopeId: buildUnsignedEnvelopeId(changedBody),
      },
      "test-signing-secret",
      "2026-06-29T00:00:00.000Z",
    );

    expect(first.signature.signature).not.toBe(second.signature.signature);
    expect(canonicalizeJson({ ...first, signature: undefined })).not.toBe(
      canonicalizeJson({ ...second, signature: undefined }),
    );
  });
});
