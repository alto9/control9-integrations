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

describe("terraform and opentofu plan envelopes", () => {
  it("builds a signed terraform plan envelope with plan fingerprint metadata", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "staging",
      requestedAuthority: "plan",
      iacTool: "terraform",
      command: "plan",
      artifactPaths: fixturePath(["terraform", "plan.json"]),
      workingDirectory: ".",
    });
    const routed = routeCommand(inputs);
    const envelope = buildSignedActionEnvelope(inputs, routed, {
      githubContext,
      signedAt: "2026-06-29T00:00:00.000Z",
    });

    expect(envelope.normalizedChangeSummary.summaryKind).toBe("terraform-plan");
    expect(envelope.normalizedChangeSummary.resourceActionCounts).toEqual({
      create: 1,
      update: 0,
      delete: 0,
      replace: 0,
      "no-op": 0,
    });
    expect(envelope.normalizedChangeSummary.details?.planFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.normalizedChangeSummary.details?.targetEnvironment).toBe("staging");
    expect(envelope.normalizedChangeSummary.details?.requestedAuthority).toBe("plan");
    expect(verifyEnvelopeSignature(envelope, "test-signing-secret")).toBe(true);
  });

  it("redacts secrets-like plan values before signing", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "production",
      requestedAuthority: "plan",
      iacTool: "terraform",
      command: "plan",
      artifactPaths: fixturePath(["terraform", "plan-secrets.json"]),
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

  it("routes opentofu plans through the shared envelope core and policy client", async () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "prod",
      requestedAuthority: "plan",
      iacTool: "opentofu",
      command: "plan",
      artifactPaths: fixturePath(["opentofu", "plan-mixed-actions.json"]),
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
            decision_id: "decision-opentofu-1",
            decision_kind: "observe",
            reason: "OpenTofu plan observed in shadow mode.",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    const decision = await client.submitEnvelope({ envelope });

    expect(envelope.iacTool).toBe("opentofu");
    expect(envelope.normalizedChangeSummary.resourceActionCounts).toEqual({
      create: 1,
      update: 1,
      delete: 0,
      replace: 1,
      "no-op": 0,
    });
    expect(envelope.normalizedChangeSummary.details?.workingDirectory).toBe(".");
    expect(artifactFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(decision.decisionKind).toBe("observe");
  });

  it("includes IAM-sensitive hints without leaking policy documents", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "staging",
      requestedAuthority: "plan",
      iacTool: "terraform",
      command: "plan",
      artifactPaths: fixturePath(["terraform", "plan-iam-sensitive.json"]),
      workingDirectory: ".",
    });
    const routed = routeCommand(inputs);
    const envelope = buildSignedActionEnvelope(inputs, routed, {
      githubContext,
      signedAt: "2026-06-29T00:00:00.000Z",
    });

    expect(envelope.normalizedChangeSummary.details?.sensitiveResourceHints).toEqual([
      "aws_iam_role",
      "aws_iam_role.example",
      "aws_iam_role_policy",
      "aws_iam_role_policy.example",
    ]);
    expect(JSON.stringify(envelope)).not.toContain("sts:AssumeRole");
  });
});
