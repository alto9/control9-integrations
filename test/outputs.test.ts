import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseActionInputs } from "../src/inputs";
import {
  buildBootstrapResult,
  buildValidationSummary,
  writeSummaryFile,
} from "../src/outputs";
import { fingerprintArtifacts, routeCommand } from "../src/routing";

describe("outputs", () => {
  it("writes a local summary file for shadow mode", () => {
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
      const summary = buildValidationSummary(inputs, routed, fingerprint);
      const summaryPath = writeSummaryFile(summary);
      const result = buildBootstrapResult(summaryPath, fingerprint, inputs.mode);

      expect(result.decisionKind).toBe("observe");
      expect(result.summaryPath).toBe(summaryPath);
      expect(readFileSync(summaryPath, "utf8")).toContain('"status": "validated"');
    } finally {
      process.env.RUNNER_TEMP = previousRunnerTemp;
    }
  });
});
