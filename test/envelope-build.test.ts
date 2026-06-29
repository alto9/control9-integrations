import { describe, expect, it } from "vitest";

import { parseActionInputs } from "../src/inputs";
import { buildSignedActionEnvelope } from "../src/envelope/build";
import { containsRawSecretMarkers } from "../src/envelope/redact";
import { verifyEnvelopeSignature } from "../src/envelope/sign";
import { routeCommand } from "../src/routing";
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
});
