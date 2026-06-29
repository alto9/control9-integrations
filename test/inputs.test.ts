import { describe, expect, it } from "vitest";

import { parseActionInputs } from "../src/inputs";
import { Control9ActionError } from "../src/types";

describe("parseActionInputs", () => {
  const valid = {
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
  };

  it("parses valid inputs", () => {
    const parsed = parseActionInputs(valid);

    expect(parsed.mode).toBe("shadow");
    expect(parsed.control9ApiUrl).toBe("https://api.control9.example");
    expect(parsed.artifactPaths).toEqual(["fixtures/terraform/plan.json"]);
    expect(parsed.redactionAdditionalPatterns).toEqual([]);
  });

  it("rejects missing API configuration", () => {
    expect(() =>
      parseActionInputs({ ...valid, control9ApiUrl: "" }),
    ).toThrow(Control9ActionError);
    expect(() =>
      parseActionInputs({ ...valid, control9ApiUrl: "" }),
    ).toThrow(/control9-api-url/);
  });

  it("rejects missing signing secret", () => {
    expect(() =>
      parseActionInputs({ ...valid, signingSecret: "" }),
    ).toThrow(/signing-secret/);
  });

  it("rejects unsupported tools", () => {
    expect(() =>
      parseActionInputs({ ...valid, iacTool: "pulumi" }),
    ).toThrow(/Unsupported iac-tool/);
  });

  it("rejects invalid API URLs", () => {
    expect(() =>
      parseActionInputs({ ...valid, control9ApiUrl: "not-a-url" }),
    ).toThrow(/Invalid control9-api-url/);
  });

  it("parses comma-separated artifact paths", () => {
    const parsed = parseActionInputs({
      ...valid,
      iacTool: "cdk",
      command: "diff",
      artifactPaths: "fixtures/cdk/stack.template.json,fixtures/cloudformation/template.json",
    });

    expect(parsed.artifactPaths).toHaveLength(2);
  });
});
