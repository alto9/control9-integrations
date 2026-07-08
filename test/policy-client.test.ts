import { describe, expect, it, vi } from "vitest";

import { parseActionInputs } from "../src/inputs";
import { buildSignedActionEnvelope } from "../src/envelope/build";
import { routeCommand } from "../src/routing";
import { Control9PolicyClient } from "../src/policy/client";
import { PolicySubmissionError } from "../src/policy/submission";
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

    const result = await client.submitEnvelopeWithOutcome({
      envelope: {
        envelopeId: "a".repeat(64),
      } as never,
    });

    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.failureKind).toBe("malformed_response");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry client configuration errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad request", { status: 400 }));
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    const result = await client.submitEnvelopeWithOutcome({
      envelope: {
        envelopeId: "a".repeat(64),
      } as never,
    });

    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.failureKind).toBe("unavailable_api");
      expect(result.detail).toMatch(/HTTP 400/);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws PolicySubmissionError from submitEnvelope on failure outcomes", async () => {
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
    ).rejects.toThrow(PolicySubmissionError);
  });

  it("accepts pending responses without retrying", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        decision_id: "dec-pending-1",
        decision_kind: "pending",
        reason: "Policy evaluation is still in progress.",
        correlation_id: "corr-saas-123",
      }),
    );
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    const decision = await client.submitEnvelope({
      envelope: {
        envelopeId: "a".repeat(64),
      } as never,
    });

    expect(decision.decisionKind).toBe("pending");
    expect(decision.correlationId).toBe("corr-saas-123");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("strips trailing slash from api base URL before submission", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        decision_id: "dec-1",
        decision_kind: "allow",
        reason: "Allowed.",
      }),
    );
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example/",
      fetchImpl,
    });

    await client.submitEnvelope({
      envelope: {
        envelopeId: "a".repeat(64),
      } as never,
    });

    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall?.[0]).toBe("https://api.control9.example/v1/action-envelopes");
  });
});
