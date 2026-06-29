import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildSignedActionEnvelope } from "../src/envelope/build";
import { parseActionInputs } from "../src/inputs";
import {
  buildActionResult,
  buildValidationSummary,
  writeSummaryFile,
} from "../src/outputs";
import { fingerprintArtifacts, routeCommand } from "../src/routing";
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

describe("outputs", () => {
  it("writes a local summary file for submitted envelopes", () => {
    const previousRunnerTemp = process.env.RUNNER_TEMP;
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "control9-test-"));
    process.env.RUNNER_TEMP = tempDirectory;

    try {
      const inputs = parseActionInputs({
        mode: "shadow",
        control9ApiUrl: "https://api.control9.example",
        tenantId: "tenant-123",
        signingSecret: "secret-value",
        targetEnvironment: "staging",
        requestedAuthority: "plan",
        iacTool: "terraform",
        command: "plan",
        artifactPaths: "fixtures/terraform/plan.json",
        workingDirectory: ".",
      });
      const routed = routeCommand(inputs);
      const fingerprint = fingerprintArtifacts(routed.resolvedArtifactPaths);
      const envelope = buildSignedActionEnvelope(inputs, routed, { githubContext });
      const decision = {
        decisionId: "dec-observe-1",
        decisionKind: "observe" as const,
        reason: "Shadow mode observation recorded.",
      };
      const summary = buildValidationSummary(
        inputs,
        routed,
        fingerprint,
        envelope,
        decision,
      );
      const summaryPath = writeSummaryFile(summary);
      const result = buildActionResult(summaryPath, fingerprint, envelope, decision);

      expect(result.decisionKind).toBe("observe");
      expect(result.envelopeId).toBe(envelope.envelopeId);
      expect(result.summaryPath).toBe(summaryPath);
      expect(readFileSync(summaryPath, "utf8")).toContain('"status": "submitted"');
    } finally {
      process.env.RUNNER_TEMP = previousRunnerTemp;
    }
  });
});
