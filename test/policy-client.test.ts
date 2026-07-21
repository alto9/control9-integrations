import { describe, expect, it, vi } from "vitest";

import { parseActionInputs } from "../src/inputs";
import { buildSignedActionEnvelope } from "../src/envelope/build";
import { routeCommand } from "../src/routing";
import { Control9PolicyClient } from "../src/policy/client";
import { PolicySubmissionError } from "../src/policy/submission";
import type { ParsedPolicyDecision } from "../src/policy/normalize";
import type { GitHubWorkflowContext } from "../src/envelope/types";
import {
  type FailureScenarioFixture,
  loadJsonFixture,
  stubSubmitEnvelopeRequest,
} from "./contract-fixtures";

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

const terminalPolicyFixtures = [
  ["allow", "fixtures/policy/allow-response.json"],
  ["deny", "fixtures/policy/deny-response.json"],
  ["require_approval", "fixtures/policy/require-approval-response.json"],
  ["observe", "fixtures/policy/observe-response.json"],
] as const;

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

  it.each(terminalPolicyFixtures)(
    "normalizes terminal %s responses from contract fixtures",
    async (_label, fixturePath) => {
      const fixture = loadJsonFixture<Record<string, unknown>>(fixturePath);
      const fetchImpl = vi.fn(async () => Response.json(fixture));
      const client = new Control9PolicyClient({
        apiBaseUrl: "https://api.control9.example",
        fetchImpl,
      });

      const decision = await client.submitEnvelope(stubSubmitEnvelopeRequest());

      expect(decision.decisionId).toBe(fixture.decisionId);
      expect(decision.decisionKind).toBe(fixture.decisionKind);
      expect(decision.reason).toBe(fixture.reason);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("normalizes pending responses from contract fixtures without retrying", async () => {
    const fixture = loadJsonFixture<Record<string, unknown>>(
      "fixtures/policy/pending-response.json",
    );
    const fetchImpl = vi.fn(async () => Response.json(fixture));
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    const decision = await client.submitEnvelope(stubSubmitEnvelopeRequest());

    expect(decision.decisionKind).toBe("pending");
    expect(decision.correlationId).toBe("corr-pending-001");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("accepts documented snake_case aliases from contract fixtures", async () => {
    const fixture = loadJsonFixture<Record<string, unknown>>(
      "fixtures/policy/snake-case-alias-response.json",
    );
    const fetchImpl = vi.fn(async () => Response.json(fixture));
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    const decision = await client.submitEnvelope(stubSubmitEnvelopeRequest());

    expect(decision).toEqual({
      decisionId: "dec-alias-1",
      decisionKind: "require_approval",
      reason: "Production change requires approval.",
      correlationId: "corr-alias-001",
      riskSummary: "Creates public resources.",
      policyVersion: "2026.06.2",
      followUp: { approval_url: "https://control9.example/approve/dec-alias-1" },
    } satisfies ParsedPolicyDecision);
  });

  it("returns malformed_response for malformed HTTP 200 contract fixtures", async () => {
    const fixture = loadJsonFixture<FailureScenarioFixture>(
      "fixtures/policy/malformed-response.json",
    );
    const fetchImpl = vi.fn(async () => Response.json(fixture.body, { status: fixture.httpStatus }));
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    const result = await client.submitEnvelopeWithOutcome(stubSubmitEnvelopeRequest());

    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.failureKind).toBe(fixture.expectedFailureKind);
      if (fixture.expectedDetailPattern) {
        expect(result.detail).toMatch(new RegExp(fixture.expectedDetailPattern, "i"));
      }
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries for unavailable API contract fixtures", async () => {
    const fixture = loadJsonFixture<FailureScenarioFixture>(
      "fixtures/policy/unavailable-api-exhaustion.json",
    );
    const fetchImpl = vi.fn(async () => new Response("busy", { status: fixture.httpStatus }));
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
      maxAttempts: fixture.attempts,
      initialBackoffMs: 1,
    });

    const result = await client.submitEnvelopeWithOutcome(stubSubmitEnvelopeRequest());

    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.failureKind).toBe(fixture.expectedFailureKind);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(fixture.attempts);
  });

  it("retries transient server failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        Response.json(loadJsonFixture("fixtures/policy/allow-response.json")),
      );

    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
      initialBackoffMs: 1,
    });

    const decision = await client.submitEnvelope(stubSubmitEnvelopeRequest());

    expect(decision.decisionKind).toBe("allow");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry client configuration errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad request", { status: 400 }));
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    const result = await client.submitEnvelopeWithOutcome(stubSubmitEnvelopeRequest());

    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.failureKind).toBe("unavailable_api");
      expect(result.detail).toMatch(/HTTP 400/);
      expect(result.detail).toMatch(/non-retryable/i);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces stable ingestion error codes in failure detail", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        {
          code: "invalid_signature",
          message: "envelope signature verification failed",
          correlationId: "corr-sig-1",
        },
        { status: 401 },
      ),
    );
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    const result = await client.submitEnvelopeWithOutcome(stubSubmitEnvelopeRequest());

    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.failureKind).toBe("unavailable_api");
      expect(result.detail).toMatch(/code=invalid_signature/);
      expect(result.detail).toMatch(/CONTROL9_SIGNING_SECRET/);
      expect(result.detail).toMatch(/corr-sig-1/);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws PolicySubmissionError from submitEnvelope on failure outcomes", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad request", { status: 400 }));
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    await expect(client.submitEnvelope(stubSubmitEnvelopeRequest())).rejects.toThrow(
      PolicySubmissionError,
    );
  });

  it("sends JSON request headers to the canonical policy route", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(loadJsonFixture("fixtures/policy/allow-response.json")),
    );
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    await client.submitEnvelope(stubSubmitEnvelopeRequest());

    const requestInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers).toMatchObject({
      "content-type": "application/json",
      accept: "application/json",
    });
  });

  it("strips trailing slash from api base URL before submission", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(loadJsonFixture("fixtures/policy/allow-response.json")),
    );
    const client = new Control9PolicyClient({
      apiBaseUrl: "https://api.control9.example/",
      fetchImpl,
    });

    await client.submitEnvelope(stubSubmitEnvelopeRequest());

    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall?.[0]).toBe("https://api.control9.example/v1/action-envelopes");
  });
});
