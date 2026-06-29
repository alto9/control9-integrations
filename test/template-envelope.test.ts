import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildSignedActionEnvelope } from "../src/envelope/build";
import { containsRawSecretMarkers } from "../src/envelope/redact";
import { verifyEnvelopeSignature } from "../src/envelope/sign";
import type { GitHubWorkflowContext } from "../src/envelope/types";
import { parseActionInputs } from "../src/inputs";
import { createPolicyClient } from "../src/policy/client";
import { fingerprintArtifacts, routeCommand } from "../src/routing";

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

const fixturePath = (segments: string[]): string =>
  path.join("fixtures", ...segments);

describe("cdk and cloudformation template envelopes", () => {
  it("builds a signed CDK synth envelope with template fingerprint metadata", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "staging",
      requestedAuthority: "synth",
      iacTool: "cdk",
      command: "synth",
      artifactPaths: fixturePath(["cdk", "stack.template.json"]),
      workingDirectory: ".",
    });
    const routed = routeCommand(inputs);
    const envelope = buildSignedActionEnvelope(inputs, routed, {
      githubContext,
      signedAt: "2026-06-29T00:00:00.000Z",
    });

    expect(envelope.normalizedChangeSummary.summaryKind).toBe("template");
    expect(envelope.iacTool).toBe("cdk");
    expect(envelope.normalizedChangeSummary.resourceActionCounts).toEqual({
      create: 1,
      update: 0,
      delete: 0,
      replace: 0,
      "no-op": 0,
    });
    expect(envelope.normalizedChangeSummary.details?.sourceTool).toBe("cdk");
    expect(envelope.normalizedChangeSummary.details?.templateFingerprint).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(envelope.normalizedChangeSummary.details?.targetEnvironment).toBe("staging");
    expect(verifyEnvelopeSignature(envelope, "test-signing-secret")).toBe(true);
  });

  it("builds a CloudFormation diff envelope from before-and-after templates", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "production",
      requestedAuthority: "diff",
      iacTool: "cloudformation",
      command: "diff",
      artifactPaths: [
        fixturePath(["cloudformation", "template-before.json"]),
        fixturePath(["cloudformation", "template-after.json"]),
      ].join(","),
      workingDirectory: ".",
    });
    const routed = routeCommand(inputs);
    const envelope = buildSignedActionEnvelope(inputs, routed, {
      githubContext,
      signedAt: "2026-06-29T00:00:00.000Z",
    });

    expect(envelope.normalizedChangeSummary.summaryKind).toBe("template");
    expect(envelope.iacTool).toBe("cloudformation");
    expect(envelope.normalizedChangeSummary.resourceActionCounts).toEqual({
      create: 0,
      update: 1,
      delete: 0,
      replace: 0,
      "no-op": 0,
    });
    expect(envelope.normalizedChangeSummary.details?.sourceTool).toBe("cloudformation");
  });

  it("redacts secrets-like template values before signing", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "production",
      requestedAuthority: "synth",
      iacTool: "cdk",
      command: "synth",
      artifactPaths: fixturePath(["cdk", "template-secrets.json"]),
      workingDirectory: ".",
    });
    const routed = routeCommand(inputs);
    const envelope = buildSignedActionEnvelope(inputs, routed, {
      githubContext,
      signedAt: "2026-06-29T00:00:00.000Z",
    });
    const serialized = JSON.stringify(envelope);

    expect(serialized).not.toContain("super-secret-db-password-12345");
    expect(serialized).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz1234567890AB");
    expect(containsRawSecretMarkers(envelope)).toBe(false);
  });

  it("routes CDK templates through the shared envelope core and policy client", async () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "prod",
      requestedAuthority: "synth",
      iacTool: "cdk",
      command: "synth",
      artifactPaths: fixturePath(["cdk", "template-iam-sensitive.json"]),
      workingDirectory: ".",
    });
    const routed = routeCommand(inputs);
    const artifactFingerprint = fingerprintArtifacts(routed.resolvedArtifactPaths);
    const envelope = buildSignedActionEnvelope(inputs, routed, {
      githubContext,
      signedAt: "2026-06-29T00:00:00.000Z",
    });
    const client = createPolicyClient({
      apiBaseUrl: inputs.control9ApiUrl,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            decision_id: "decision-cdk-1",
            decision_kind: "observe",
            reason: "CDK template observed in shadow mode.",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    const decision = await client.submitEnvelope({ envelope });

    expect(envelope.normalizedChangeSummary.details?.sensitiveResourceHints).toEqual([
      "AWS::IAM::Policy",
      "AWS::IAM::Role",
      "ExamplePolicy",
      "ExampleRole",
    ]);
    expect(artifactFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(decision.decisionKind).toBe("observe");
    expect(JSON.stringify(envelope)).not.toContain("sts:AssumeRole");
  });

  it("rejects unsupported single-artifact diff combinations during envelope build", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "staging",
      requestedAuthority: "diff",
      iacTool: "cdk",
      command: "diff",
      artifactPaths: fixturePath(["cdk", "stack.template.json"]),
      workingDirectory: ".",
    });
    const routed = routeCommand(inputs);

    expect(() =>
      buildSignedActionEnvelope(inputs, routed, {
        githubContext,
        signedAt: "2026-06-29T00:00:00.000Z",
      }),
    ).toThrow(/before-and-after template pair/);
  });
});
