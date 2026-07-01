import { describe, expect, it, vi } from "vitest";

import { parseActionInputs } from "../src/inputs";
import { buildSignedActionEnvelope } from "../src/envelope/build";
import { routeCommand } from "../src/routing";
import { Control9VerificationClient } from "../src/verification/client";
import { VerificationSubmissionError } from "../src/verification/submission";
import type { GitHubWorkflowContext } from "../src/envelope/types";

const githubContext: GitHubWorkflowContext = {
  correlationId: "123:1",
  providerContext: { provider: "github" },
  runIdentity: {
    runId: "123",
    runAttempt: "1",
    workflow: "control9",
    job: "verify",
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

describe("Control9VerificationClient", () => {
  it("submits a signed envelope and normalizes the response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        verification_id: "verify-001",
        verification_status: "verified",
        decision_id: "dec-approved-001",
      }),
    );

    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "test-signing-secret",
      targetEnvironment: "staging",
      requestedAuthority: "apply",
      iacTool: "terraform",
      command: "deploy-verification",
      artifactPaths: "fixtures/terraform/plan.json",
      workingDirectory: ".",
    });
    const routed = routeCommand(inputs);
    const envelope = buildSignedActionEnvelope(inputs, routed, { githubContext });
    const client = new Control9VerificationClient({
      apiBaseUrl: inputs.control9ApiUrl,
      fetchImpl,
    });

    const verification = await client.submitVerification({ envelope });

    expect(verification.verificationStatus).toBe("verified");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall?.[0]).toBe("https://api.control9.example/v1/deploy-verifications");
  });

  it("retries transient server failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          verification_id: "verify-002",
          verification_status: "verified",
        }),
      );

    const client = new Control9VerificationClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
      initialBackoffMs: 1,
    });

    const verification = await client.submitVerification({
      envelope: {
        envelopeId: "a".repeat(64),
      } as never,
    });

    expect(verification.verificationStatus).toBe("verified");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry local validation failures", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        verification_id: "verify-003",
      }),
    );
    const client = new Control9VerificationClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    const result = await client.submitVerificationWithOutcome({
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
    const client = new Control9VerificationClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    const result = await client.submitVerificationWithOutcome({
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

  it("throws VerificationSubmissionError from submitVerification on failure outcomes", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad request", { status: 400 }));
    const client = new Control9VerificationClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    await expect(
      client.submitVerification({
        envelope: {
          envelopeId: "a".repeat(64),
        } as never,
      }),
    ).rejects.toThrow(VerificationSubmissionError);
  });
});
