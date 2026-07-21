import { afterEach, describe, expect, it } from "vitest";

import { parseActionInputs, readActionInputsFromEnv } from "../src/inputs";
import { Control9ActionError } from "../src/types";

const INPUT_ENV_KEYS = [
  "INPUT_MODE",
  "INPUT_CONTROL9-API-URL",
  "INPUT_CONTROL9_API_URL",
  "INPUT_TENANT-ID",
  "INPUT_TENANT_ID",
  "INPUT_SIGNING-SECRET",
  "INPUT_SIGNING_SECRET",
  "INPUT_TARGET-ENVIRONMENT",
  "INPUT_TARGET_ENVIRONMENT",
  "INPUT_REQUESTED-AUTHORITY",
  "INPUT_REQUESTED_AUTHORITY",
  "INPUT_IAC-TOOL",
  "INPUT_IAC_TOOL",
  "INPUT_COMMAND",
  "INPUT_ARTIFACT-PATHS",
  "INPUT_ARTIFACT_PATHS",
  "INPUT_WORKING-DIRECTORY",
  "INPUT_WORKING_DIRECTORY",
] as const;

afterEach(() => {
  for (const key of INPUT_ENV_KEYS) {
    delete process.env[key];
  }
});

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
    expect(parsed.failOpenEnvironments).toEqual([]);
  });

  it("parses fail-open-environments with trim, lowercase, and dedupe", () => {
    const parsed = parseActionInputs({
      ...valid,
      failOpenEnvironments: " Staging , DEV , staging ,  ",
    });

    expect(parsed.failOpenEnvironments).toEqual(["staging", "dev"]);
  });

  it("defaults fail-open-environments to an empty list when omitted", () => {
    const parsed = parseActionInputs(valid);
    expect(parsed.failOpenEnvironments).toEqual([]);
  });

  it("defaults fail-open-environments to an empty list when blank", () => {
    const parsed = parseActionInputs({ ...valid, failOpenEnvironments: "   " });
    expect(parsed.failOpenEnvironments).toEqual([]);
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

describe("readActionInputsFromEnv", () => {
  it("reads hyphenated GitHub Actions INPUT_* env vars", () => {
    process.env.INPUT_MODE = "shadow";
    process.env["INPUT_CONTROL9-API-URL"] = "https://api.control9.example";
    process.env["INPUT_TENANT-ID"] = "tenant-github";
    process.env["INPUT_SIGNING-SECRET"] = "secret-value";
    process.env["INPUT_TARGET-ENVIRONMENT"] = "staging";
    process.env["INPUT_REQUESTED-AUTHORITY"] = "apply";
    process.env["INPUT_IAC-TOOL"] = "cdk";
    process.env.INPUT_COMMAND = "synth";
    process.env["INPUT_ARTIFACT-PATHS"] = "fixtures/cdk/stack.template.json";
    process.env["INPUT_WORKING-DIRECTORY"] = ".";

    const parsed = readActionInputsFromEnv();

    expect(parsed.control9ApiUrl).toBe("https://api.control9.example");
    expect(parsed.tenantId).toBe("tenant-github");
    expect(parsed.iacTool).toBe("cdk");
    expect(parsed.command).toBe("synth");
  });

  it("falls back to underscore INPUT_* env vars used by GitLab", () => {
    process.env.INPUT_MODE = "shadow";
    process.env.INPUT_CONTROL9_API_URL = "https://api.control9.example";
    process.env.INPUT_TENANT_ID = "tenant-gitlab";
    process.env.INPUT_SIGNING_SECRET = "secret-value";
    process.env.INPUT_TARGET_ENVIRONMENT = "staging";
    process.env.INPUT_REQUESTED_AUTHORITY = "plan";
    process.env.INPUT_IAC_TOOL = "terraform";
    process.env.INPUT_COMMAND = "plan";
    process.env.INPUT_ARTIFACT_PATHS = "fixtures/terraform/plan.json";
    process.env.INPUT_WORKING_DIRECTORY = ".";

    const parsed = readActionInputsFromEnv();

    expect(parsed.control9ApiUrl).toBe("https://api.control9.example");
    expect(parsed.tenantId).toBe("tenant-gitlab");
    expect(parsed.iacTool).toBe("terraform");
  });
});
