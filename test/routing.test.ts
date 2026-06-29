import { describe, expect, it } from "vitest";

import { parseActionInputs } from "../src/inputs";
import { fingerprintArtifacts, routeCommand } from "../src/routing";
import { Control9ActionError } from "../src/types";

describe("routeCommand", () => {
  it("routes terraform plan artifacts", () => {
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

    expect(routed.resolvedArtifactPaths[0]).toMatch(/fixtures\/terraform\/plan\.json$/);
  });

  it("rejects unsupported command and tool combinations", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "secret-value",
      targetEnvironment: "staging",
      requestedAuthority: "plan",
      iacTool: "terraform",
      command: "synth",
      artifactPaths: "fixtures/terraform/plan.json",
      workingDirectory: ".",
    });

    expect(() => routeCommand(inputs)).toThrow(/Unsupported command "synth" for iac-tool "terraform"/);
  });

  it("rejects unreadable artifact paths", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "secret-value",
      targetEnvironment: "staging",
      requestedAuthority: "plan",
      iacTool: "terraform",
      command: "plan",
      artifactPaths: "fixtures/missing/plan.json",
      workingDirectory: ".",
    });

    expect(() => routeCommand(inputs)).toThrow(/Unreadable artifact path/);
  });

  it("rejects ambiguous deploy verification combinations", () => {
    const inputs = parseActionInputs({
      mode: "shadow",
      control9ApiUrl: "https://api.control9.example",
      tenantId: "tenant-123",
      signingSecret: "secret-value",
      targetEnvironment: "staging",
      requestedAuthority: "deploy",
      iacTool: "cdk",
      command: "deploy-verification",
      artifactPaths:
        "fixtures/cdk/stack.template.json,fixtures/cloudformation/template.json",
      workingDirectory: ".",
    });

    expect(() => routeCommand(inputs)).toThrow(Control9ActionError);
    expect(() => routeCommand(inputs)).toThrow(/Ambiguous deploy-verification/);
  });

  it("computes stable artifact fingerprints", () => {
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
    const first = fingerprintArtifacts(routed.resolvedArtifactPaths);
    const second = fingerprintArtifacts(routed.resolvedArtifactPaths);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
  });
});
