import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runGitLabAssessment } from "../src/gitlab/runner";
import { POLICY_SECTION_ID } from "../src/gitlab/job-log";
import { OUTCOME_TEMPLATES } from "../src/rendering/templates";

interface RenderingFixture {
  decisionId: string;
  decisionKind: string;
  reason: string;
}

const denyFixture = JSON.parse(
  readFileSync("fixtures/rendering/deny-decision.json", "utf8"),
) as RenderingFixture;

describe("runGitLabAssessment", () => {
  let tempDirectory: string;
  let previousEnv: NodeJS.ProcessEnv;
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    previousEnv = { ...process.env };
    tempDirectory = mkdtempSync(path.join(tmpdir(), "control9-gitlab-run-"));
    writeFileSync(path.join(tempDirectory, "placeholder"), "", "utf8");

    process.env.RUNNER_TEMP = tempDirectory;
    process.env.CONTROL9_PROVIDER = "gitlab";
    process.env.CI_PROJECT_PATH = "acme/infra";
    process.env.CI_PIPELINE_ID = "100";
    process.env.CI_JOB_ID = "200";
    process.env.CI_JOB_NAME = "control9";
    process.env.CI_COMMIT_REF_NAME = "main";
    process.env.CI_COMMIT_SHA = "abc123abc123abc123abc123abc123abc123ab";
    process.env.GITLAB_USER_LOGIN = "dev";
    process.env.CI_SERVER_URL = "https://gitlab.example.com";
    process.env.INPUT_MODE = "shadow";
    process.env.INPUT_CONTROL9_API_URL = "https://api.control9.example";
    process.env.INPUT_TENANT_ID = "tenant-gitlab";
    process.env.INPUT_SIGNING_SECRET = "gitlab-signing-secret";
    process.env.INPUT_TARGET_ENVIRONMENT = "staging";
    process.env.INPUT_REQUESTED_AUTHORITY = "plan";
    process.env.INPUT_IAC_TOOL = "terraform";
    process.env.INPUT_COMMAND = "plan";
    process.env.INPUT_ARTIFACT_PATHS = "fixtures/terraform/plan.json";
    process.env.INPUT_WORKING_DIRECTORY = ".";

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    process.env = previousEnv;
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  function mockPolicySuccess(fixture: RenderingFixture): void {
    fetchMock.mockResolvedValue(
      Response.json({
        decision_id: fixture.decisionId,
        decision_kind: fixture.decisionKind,
        reason: fixture.reason,
      }),
    );
  }

  it("builds a gitlab provider envelope and emits collapsible job log sections in shadow mode", async () => {
    mockPolicySuccess(denyFixture);

    await expect(runGitLabAssessment()).resolves.toBeUndefined();

    const summaryPath = path.join(tempDirectory, "control9-summary.json");
    const summaryJson = readFileSync(summaryPath, "utf8");
    expect(summaryJson).toContain('"decisionKind": "deny"');
    const logged = logSpy.mock.calls.map(([line]) => String(line));
    expect(logged.some((line) => line.includes(`section_start:`) && line.includes(POLICY_SECTION_ID))).toBe(
      true,
    );
    expect(logged.some((line) => line.includes(OUTCOME_TEMPLATES.deny.label))).toBe(true);
    expect(logged.some((line) => line.match(/^Control9 NOTICE:/))).toBe(true);
    expect(process.exitCode).not.toBe(1);
  });

  it("throws when enforce-mode deny blocks the workflow", async () => {
    process.env.INPUT_MODE = "enforce";
    process.env.INPUT_TARGET_ENVIRONMENT = "production";
    mockPolicySuccess(denyFixture);

    await expect(runGitLabAssessment()).rejects.toThrow(/Policy restriction triggered/i);
  });

  it("maps blocking errors to a non-zero exit code in the CLI entrypoint", async () => {
    process.env.INPUT_MODE = "enforce";
    process.env.INPUT_TARGET_ENVIRONMENT = "production";
    mockPolicySuccess(denyFixture);

    try {
      await runGitLabAssessment();
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
        process.exitCode = 1;
      }
    }

    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/Policy restriction triggered/i));
    expect(process.exitCode).toBe(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe("runGitLabAssessment envelope provider", () => {
  let previousEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    previousEnv = { ...process.env };
    process.env.CONTROL9_PROVIDER = "gitlab";
    process.env.CI_PROJECT_PATH = "acme/infra";
    process.env.CI_PIPELINE_ID = "100";
    process.env.CI_JOB_ID = "200";
    process.env.CI_JOB_NAME = "control9";
    process.env.CI_COMMIT_REF_NAME = "main";
    process.env.CI_COMMIT_SHA = "abc123abc123abc123abc123abc123abc123ab";
    process.env.GITLAB_USER_LOGIN = "dev";
    process.env.INPUT_MODE = "shadow";
    process.env.INPUT_CONTROL9_API_URL = "https://api.control9.example";
    process.env.INPUT_TENANT_ID = "tenant-gitlab";
    process.env.INPUT_SIGNING_SECRET = "gitlab-signing-secret";
    process.env.INPUT_TARGET_ENVIRONMENT = "staging";
    process.env.INPUT_REQUESTED_AUTHORITY = "plan";
    process.env.INPUT_IAC_TOOL = "terraform";
    process.env.INPUT_COMMAND = "plan";
    process.env.INPUT_ARTIFACT_PATHS = "fixtures/terraform/plan.json";
    process.env.INPUT_WORKING_DIRECTORY = ".";
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = previousEnv;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("submits envelopes whose providerContext.provider is gitlab", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        decision_id: "dec-gitlab",
        decision_kind: "allow",
        reason: "Allowed.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runGitLabAssessment();

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body)) as {
      providerContext: { provider: string };
    };
    expect(body.providerContext.provider).toBe("gitlab");
  });
});
