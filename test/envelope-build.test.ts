import { describe, expect, it, vi } from "vitest";

import { parseActionInputs } from "../src/inputs";
import { buildSignedActionEnvelope } from "../src/envelope/build";
import * as redactModule from "../src/envelope/redact";
import { containsRawSecretMarkers } from "../src/envelope/redact";
import { verifyEnvelopeSignature } from "../src/envelope/sign";
import { validateActionEnvelopeSchema } from "../src/envelope/validate-schema";
import { routeCommand } from "../src/routing";
import { Control9ActionError } from "../src/types";
import type { GitHubWorkflowContext } from "../src/envelope/types";

const githubContext: GitHubWorkflowContext = {
  correlationId: "123:1",
  providerContext: { provider: "github", eventName: "workflow_dispatch" },
  runIdentity: {
    runId: "123",
    runAttempt: "1",
    workflow: "control9",
    job: "evaluate",
  },
  repositoryIdentity: {
    owner: "acme",
    name: "infra",
    fullName: "acme/infra",
  },
  refOrPullRequestIdentity: {
    ref: "refs/heads/main",
    sha: "abc123",
  },
  actorIdentity: {
    login: "dev",
    actorType: "User",
  },
};

describe("buildSignedActionEnvelope", () => {
  it("builds a signed terraform plan envelope without leaking secrets", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "staging",
      requestedAuthority: "plan",
      iacTool: "terraform",
      command: "plan",
      artifactPaths: "fixtures/terraform/plan.json",
      workingDirectory: ".",
    });
    const routed = routeCommand(inputs);
    const envelope = buildSignedActionEnvelope(inputs, routed, {
      githubContext,
      signedAt: "2026-06-29T00:00:00.000Z",
    });

    expect(envelope.schemaVersion).toBe("control9.action-envelope.v0");
    expect(envelope.envelopeId).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.normalizedChangeSummary.summaryKind).toBe("terraform-plan");
    expect(envelope.normalizedChangeSummary.resourceActionCounts).toEqual({
      create: 1,
      update: 0,
      delete: 0,
      replace: 0,
      "no-op": 0,
    });
    expect(verifyEnvelopeSignature(envelope, "test-signing-secret")).toBe(true);
    expect(containsRawSecretMarkers(envelope)).toBe(false);
    expect(JSON.stringify(envelope)).not.toContain("test-signing-secret");
  });

  it("fails when redacted summary still contains raw secret markers", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "staging",
      requestedAuthority: "plan",
      iacTool: "terraform",
      command: "plan",
      artifactPaths: "fixtures/terraform/plan.json",
      workingDirectory: ".",
    });
    const routed = routeCommand(inputs);
    const spy = vi
      .spyOn(redactModule, "containsRawSecretMarkers")
      .mockReturnValue(true);

    expect(() =>
      buildSignedActionEnvelope(inputs, routed, {
        githubContext,
        signedAt: "2026-06-29T00:00:00.000Z",
      }),
    ).toThrow(Control9ActionError);

    spy.mockRestore();
  });

  it("validates the signed envelope against the action-envelope schema", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "staging",
      requestedAuthority: "plan",
      iacTool: "terraform",
      command: "plan",
      artifactPaths: "fixtures/terraform/plan.json",
      workingDirectory: ".",
    });
    const routed = routeCommand(inputs);
    const envelope = buildSignedActionEnvelope(inputs, routed, {
      githubContext,
      signedAt: "2026-06-29T00:00:00.000Z",
    });

    expect(() => validateActionEnvelopeSchema(envelope)).not.toThrow();
  });

  it("rejects envelopes that violate the action-envelope schema", () => {
    expect(() =>
      validateActionEnvelopeSchema({
        schemaVersion: "control9.action-envelope.v0",
      } as never),
    ).toThrow(Control9ActionError);
  });
});
