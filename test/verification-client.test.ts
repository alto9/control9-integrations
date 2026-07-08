import { describe, expect, it, vi } from "vitest";

import { parseActionInputs } from "../src/inputs";
import { buildSignedActionEnvelope } from "../src/envelope/build";
import { routeCommand } from "../src/routing";
import { Control9VerificationClient } from "../src/verification/client";
import { VerificationSubmissionError } from "../src/verification/submission";
import type { DeployVerification } from "../src/verification/types";
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

const terminalVerificationFixtures = [
  ["verified", "fixtures/verification/verified-response.json"],
  ["fingerprint_mismatch", "fixtures/verification/fingerprint-mismatch-response.json"],
  ["no_approved_baseline", "fixtures/verification/no-approved-baseline-response.json"],
] as const;

describe("Control9VerificationClient", () => {
  it("submits a signed envelope and normalizes the response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(loadJsonFixture("fixtures/verification/verified-response.json")),
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

  it.each(terminalVerificationFixtures)(
    "normalizes terminal %s responses from contract fixtures",
    async (_label, fixturePath) => {
      const fixture = loadJsonFixture<Record<string, unknown>>(fixturePath);
      const fetchImpl = vi.fn(async () => Response.json(fixture));
      const client = new Control9VerificationClient({
        apiBaseUrl: "https://api.control9.example",
        fetchImpl,
      });

      const verification = await client.submitVerification(stubSubmitEnvelopeRequest());

      expect(verification.verificationId).toBe(fixture.verificationId);
      expect(verification.verificationStatus).toBe(fixture.verificationStatus);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("accepts documented snake_case aliases from contract fixtures", async () => {
    const fixture = loadJsonFixture<Record<string, unknown>>(
      "fixtures/verification/snake-case-alias-response.json",
    );
    const fetchImpl = vi.fn(async () => Response.json(fixture));
    const client = new Control9VerificationClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    const verification = await client.submitVerification(stubSubmitEnvelopeRequest());

    expect(verification).toEqual({
      verificationId: "verify-alias-001",
      verificationStatus: "fingerprint_mismatch",
      decisionId: "dec-approved-003",
      expectedFingerprint: "fp-baseline-approved",
      actualFingerprint: "fp-current-artifact",
      reason: "Artifact fingerprint does not match the approved baseline.",
    } satisfies DeployVerification);
  });

  it("returns malformed_response for malformed HTTP 200 contract fixtures", async () => {
    const fixture = loadJsonFixture<FailureScenarioFixture>(
      "fixtures/verification/malformed-response.json",
    );
    const fetchImpl = vi.fn(async () => Response.json(fixture.body, { status: fixture.httpStatus }));
    const client = new Control9VerificationClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    const result = await client.submitVerificationWithOutcome(stubSubmitEnvelopeRequest());

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
      "fixtures/verification/unavailable-api-exhaustion.json",
    );
    const fetchImpl = vi.fn(async () => new Response("busy", { status: fixture.httpStatus }));
    const client = new Control9VerificationClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
      maxAttempts: fixture.attempts,
      initialBackoffMs: 1,
    });

    const result = await client.submitVerificationWithOutcome(stubSubmitEnvelopeRequest());

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
        Response.json(loadJsonFixture("fixtures/verification/verified-response.json")),
      );

    const client = new Control9VerificationClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
      initialBackoffMs: 1,
    });

    const verification = await client.submitVerification(stubSubmitEnvelopeRequest());

    expect(verification.verificationStatus).toBe("verified");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry client configuration errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad request", { status: 400 }));
    const client = new Control9VerificationClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    const result = await client.submitVerificationWithOutcome(stubSubmitEnvelopeRequest());

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

    await expect(client.submitVerification(stubSubmitEnvelopeRequest())).rejects.toThrow(
      VerificationSubmissionError,
    );
  });

  it("sends JSON request headers to the canonical verification route", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(loadJsonFixture("fixtures/verification/verified-response.json")),
    );
    const client = new Control9VerificationClient({
      apiBaseUrl: "https://api.control9.example",
      fetchImpl,
    });

    await client.submitVerification(stubSubmitEnvelopeRequest());

    const requestInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers).toMatchObject({
      "content-type": "application/json",
      accept: "application/json",
    });
  });

  it("strips trailing slash from api base URL before submission", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(loadJsonFixture("fixtures/verification/verified-response.json")),
    );
    const client = new Control9VerificationClient({
      apiBaseUrl: "https://api.control9.example/",
      fetchImpl,
    });

    await client.submitVerification(stubSubmitEnvelopeRequest());

    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall?.[0]).toBe("https://api.control9.example/v1/deploy-verifications");
  });
});
