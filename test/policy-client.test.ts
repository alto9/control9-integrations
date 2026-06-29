import { describe, expect, it, vi } from "vitest";

import { parseActionInputs } from "../src/inputs";
import { buildSignedActionEnvelope } from "../src/envelope/build";
import { routeCommand } from "../src/routing";
import { Control9PolicyClient } from "../src/policy/client";
import { Control9ActionError } from "../src/types";
import type { GitHubWorkflowContext } from "../src/envelope/types";

const githubContext: GitHubWorkflowContext = {
  correlationId: "123:1",
  providerContext: { provider: "github" },
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

describe("Control9PolicyClient", () => {
  it("submits a signed envelope and normalizes the response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        decision_id: "dec-observe-1",
        decision_kind: "observe",
        reason: "Shadow mode observation recorded.",
      }),
    );

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
    const envelope = buildSignedActionEnvelope(inputs, routed, { githubContext });
    const client = new Control9PolicyClient({
      apiBaseUrl: inputs.control9ApiUrl,
      fetchImpl,
    });

    const decision = await client.submitEnvelope({ envelope });

    expect(decision.decisionKind).toBe("observe");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall?.[0]).toBe("https://api.control9.example/v1/action-envelopes");
  });

  it("retries transient server failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          decision_id: "dec-2",
          decision_kind: "allow",
          reason: "Allowed by policy.",
        }),
      );

    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
      initialBackoffMs: 1,
    });

    const decision = await client.submitEnvelope({
      envelope: {
        envelopeId: "a".repeat(64),
      } as never,
    });

    expect(decision.decisionKind).toBe("allow");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry local validation failures", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        decision_id: "dec-3",
      }),
    );
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    await expect(
      client.submitEnvelope({
        envelope: {
          envelopeId: "a".repeat(64),
        } as never,
      }),
    ).rejects.toThrow(Control9ActionError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry client configuration errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad request", { status: 400 }));
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    await expect(
      client.submitEnvelope({
        envelope: {
          envelopeId: "a".repeat(64),
        } as never,
      }),
    ).rejects.toThrow(/HTTP 400/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
