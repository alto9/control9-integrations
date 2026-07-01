import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEPLOY_VERIFICATION_SECTION_HEADING,
  SUMMARY_SECTION_HEADING,
} from "../src/github/workflow-summary";
import {
  DEPLOY_VERIFICATION_SECTION_ID,
  POLICY_SECTION_ID,
} from "../src/gitlab/job-log";
import { CONTROL9_MR_MARKER_PREFIX } from "../src/gitlab/mr-note";
import { runGitLabAssessment } from "../src/gitlab/runner";
import { Control9ActionError } from "../src/types";

interface PipelineFixture {
  env: Record<string, string>;
}

interface RenderingFixture {
  decisionId: string;
  decisionKind: string;
  reason: string;
}

interface PresentationExpectations {
  policySectionHeading: string;
  policySectionId: string;
  deployVerificationSectionHeading: string;
  deployVerificationSectionId: string;
}

const mergeRequestPipeline = JSON.parse(
  readFileSync("fixtures/gitlab/merge-request-pipeline.json", "utf8"),
) as PipelineFixture;
const defaultBranchPipeline = JSON.parse(
  readFileSync("fixtures/gitlab/default-branch-pipeline.json", "utf8"),
) as PipelineFixture;
const allowFixture = JSON.parse(
  readFileSync("fixtures/rendering/allow-decision.json", "utf8"),
) as RenderingFixture;
const denyFixture = JSON.parse(
  readFileSync("fixtures/rendering/deny-decision.json", "utf8"),
) as RenderingFixture;
const verifiedFixture = JSON.parse(
  readFileSync("fixtures/rendering/verified-response.json", "utf8"),
) as {
  verificationId: string;
  verificationStatus: string;
  decisionId: string;
};
const presentationExpectations = JSON.parse(
  readFileSync("fixtures/gitlab/policy-presentation-expectations.json", "utf8"),
) as PresentationExpectations;
const deployPresentationExpectations = JSON.parse(
  readFileSync("fixtures/gitlab/deploy-verification-presentation-expectations.json", "utf8"),
) as PresentationExpectations;

function applyPipelineEnv(fixture: PipelineFixture): void {
  for (const [key, value] of Object.entries(fixture.env)) {
    process.env[key] = value;
  }
}

function applyControl9Inputs(tempDirectory: string): void {
  process.env.RUNNER_TEMP = tempDirectory;
  process.env.CONTROL9_PROVIDER = "gitlab";
  process.env.INPUT_CONTROL9_API_URL = "https://api.control9.example";
  process.env.INPUT_TENANT_ID = "tenant-gitlab";
  process.env.INPUT_SIGNING_SECRET = "gitlab-signing-secret";
  process.env.INPUT_TARGET_ENVIRONMENT = "staging";
  process.env.INPUT_REQUESTED_AUTHORITY = "plan";
  process.env.INPUT_IAC_TOOL = "terraform";
  process.env.INPUT_COMMAND = "plan";
  process.env.INPUT_ARTIFACT_PATHS = "fixtures/terraform/plan.json";
  process.env.INPUT_WORKING_DIRECTORY = ".";
}

describe("runGitLabAssessment presentation orchestration", () => {
  let tempDirectory: string;
  let gitlabEnvPath: string;
  let previousEnv: NodeJS.ProcessEnv;
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    previousEnv = { ...process.env };
    tempDirectory = mkdtempSync(path.join(tmpdir(), "control9-gitlab-presentation-"));
    gitlabEnvPath = path.join(tempDirectory, "gitlab.env");
    writeFileSync(path.join(tempDirectory, "placeholder"), "", "utf8");
    writeFileSync(gitlabEnvPath, "", "utf8");

    applyControl9Inputs(tempDirectory);
    applyPipelineEnv(mergeRequestPipeline);
    process.env.CI_PROJECT_ID = "99";
    process.env.CONTROL9_GITLAB_TOKEN = "glpat-test-token";
    process.env.GITLAB_ENV = gitlabEnvPath;
    process.env.INPUT_MODE = "shadow";

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = previousEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mockPolicyAndMrNoteApis(fixture: RenderingFixture): void {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("api.control9.example")) {
        return Response.json({
          decision_id: fixture.decisionId,
          decision_kind: fixture.decisionKind,
          reason: fixture.reason,
        });
      }

      if (url.includes("/merge_requests/") && url.includes("/notes") && init?.method === "GET") {
        return Response.json([]);
      }

      if (url.includes("/merge_requests/") && url.includes("/notes") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { body: string };
        return Response.json({ id: 5001, body: body.body });
      }

      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    });
  }

  function mockVerificationAndMrNoteApis(): void {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("api.control9.example")) {
        return Response.json({
          verification_id: verifiedFixture.verificationId,
          verification_status: verifiedFixture.verificationStatus,
          decision_id: verifiedFixture.decisionId,
        });
      }

      if (url.includes("/merge_requests/") && url.includes("/notes") && init?.method === "GET") {
        return Response.json([]);
      }

      if (url.includes("/merge_requests/") && url.includes("/notes") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { body: string };
        return Response.json({ id: 5002, body: body.body });
      }

      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    });
  }

  function loggedLines(): string[] {
    return logSpy.mock.calls.map(([line]) => String(line));
  }

  function indexOfFirstMatching(lines: string[], pattern: RegExp): number {
    return lines.findIndex((line) => pattern.test(line));
  }

  it("runs presentation in order: log prefix, collapsible section, MR note API, then exit 0 in shadow mode", async () => {
    mockPolicyAndMrNoteApis(allowFixture);

    await expect(runGitLabAssessment()).resolves.toBeUndefined();

    const lines = loggedLines();
    const prefixIndex = indexOfFirstMatching(lines, /^Control9 NOTICE:/);
    const sectionStartIndex = indexOfFirstMatching(
      lines,
      new RegExp(`section_start:\\d+:${POLICY_SECTION_ID}`),
    );
    const sectionEndIndex = indexOfFirstMatching(
      lines,
      new RegExp(`section_end:\\d+:${POLICY_SECTION_ID}`),
    );
    const summaryIndex = indexOfFirstMatching(lines, /^Control9 summary JSON:/);

    expect(prefixIndex).toBeGreaterThanOrEqual(0);
    expect(sectionStartIndex).toBeGreaterThan(prefixIndex);
    expect(sectionEndIndex).toBeGreaterThan(sectionStartIndex);
    expect(summaryIndex).toBeGreaterThan(sectionEndIndex);

    const mrNoteCallIndex = fetchMock.mock.calls.findIndex(([url, init]) => {
      return (
        String(url).includes("/merge_requests/") &&
        String(url).includes("/notes") &&
        (init as RequestInit | undefined)?.method === "POST"
      );
    });
    expect(mrNoteCallIndex).toBeGreaterThanOrEqual(0);

    const envContents = readFileSync(gitlabEnvPath, "utf8");
    expect(envContents).toContain("CONTROL9_JOB_SECTION_WRITTEN=true");
    expect(envContents).toContain("CONTROL9_USED_LOG_FALLBACK=false");
    expect(envContents).toContain("CONTROL9_MR_NOTE_STATE=created");

    const mrNoteBody = JSON.parse(
      String(fetchMock.mock.calls[mrNoteCallIndex]?.[1]?.body),
    ) as { body: string };
    expect(mrNoteBody.body).toContain(CONTROL9_MR_MARKER_PREFIX);
    expect(mrNoteBody.body).toContain(SUMMARY_SECTION_HEADING);
  });

  it("uses NOTICE prefix for shadow deny and exit 0 without calling MR note create on default-branch pipeline", async () => {
    applyPipelineEnv(defaultBranchPipeline);
    delete process.env.CI_MERGE_REQUEST_IID;
    mockPolicyAndMrNoteApis(denyFixture);

    await expect(runGitLabAssessment()).resolves.toBeUndefined();

    const lines = loggedLines();
    expect(lines[0]).toMatch(/^Control9 NOTICE:/);
    expect(lines.some((line) => line.includes(SUMMARY_SECTION_HEADING))).toBe(true);

    const mrNoteCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/merge_requests/"),
    );
    expect(mrNoteCalls).toHaveLength(0);

    const envContents = readFileSync(gitlabEnvPath, "utf8");
    expect(envContents).toContain("CONTROL9_MR_NOTE_STATE=skipped-no-mr");
  });

  it("uses WARNING prefix and blocks with non-zero outcome in enforce mode before MR note on MR pipeline", async () => {
    process.env.INPUT_MODE = "enforce";
    process.env.INPUT_TARGET_ENVIRONMENT = "production";
    mockPolicyAndMrNoteApis(denyFixture);

    await expect(runGitLabAssessment()).rejects.toBeInstanceOf(Control9ActionError);

    const lines = loggedLines();
    expect(lines[0]).toMatch(/^Control9 WARNING:/);
    expect(lines.some((line) => line.includes(presentationExpectations.policySectionHeading))).toBe(
      true,
    );

    const mrNoteCallIndex = fetchMock.mock.calls.findIndex(([url, init]) => {
      return (
        String(url).includes("/merge_requests/") &&
        (init as RequestInit | undefined)?.method === "POST"
      );
    });
    const prefixIndex = 0;
    expect(mrNoteCallIndex).toBeGreaterThan(prefixIndex);

    const envContents = readFileSync(gitlabEnvPath, "utf8");
    expect(envContents).toContain("CONTROL9_MR_NOTE_STATE=created");
  });

  it("updates an existing MR note when the Control9 marker matches", async () => {
    const marker = `<!-- ${CONTROL9_MR_MARKER_PREFIX}:pipeline=${mergeRequestPipeline.env.CI_PIPELINE_ID}:job=${mergeRequestPipeline.env.CI_JOB_NAME} -->`;

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("api.control9.example")) {
        return Response.json({
          decision_id: allowFixture.decisionId,
          decision_kind: allowFixture.decisionKind,
          reason: allowFixture.reason,
        });
      }

      if (url.includes("/merge_requests/") && url.includes("/notes") && init?.method === "GET") {
        return Response.json([{ id: 8801, body: `${marker}\n\nPrevious note` }]);
      }

      if (url.includes("/merge_requests/") && url.includes("/notes") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { body: string };
        return Response.json({ id: 8801, body: body.body });
      }

      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    });

    await expect(runGitLabAssessment()).resolves.toBeUndefined();

    const updateCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/notes/8801") && (init as RequestInit | undefined)?.method === "PUT",
    );
    expect(updateCall).toBeDefined();

    const envContents = readFileSync(gitlabEnvPath, "utf8");
    expect(envContents).toContain("CONTROL9_MR_NOTE_STATE=updated");
  });

  it("skips MR note when no token is available on a merge request pipeline", async () => {
    delete process.env.CONTROL9_GITLAB_TOKEN;
    delete process.env.GITLAB_TOKEN;
    delete process.env.CI_JOB_TOKEN;

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("api.control9.example")) {
        return Response.json({
          decision_id: allowFixture.decisionId,
          decision_kind: allowFixture.decisionKind,
          reason: allowFixture.reason,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await expect(runGitLabAssessment()).resolves.toBeUndefined();

    const mrNoteCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/merge_requests/"),
    );
    expect(mrNoteCalls).toHaveLength(0);

    const envContents = readFileSync(gitlabEnvPath, "utf8");
    expect(envContents).toContain("CONTROL9_MR_NOTE_STATE=skipped-no-token");
    expect(loggedLines()[0]).toMatch(/^Control9 NOTICE:/);
  });

  it("uses deploy verification section heading and id for deploy-verification command", async () => {
    process.env.INPUT_COMMAND = "deploy-verification";
    process.env.INPUT_REQUESTED_AUTHORITY = "apply";
    mockVerificationAndMrNoteApis();

    await expect(runGitLabAssessment()).resolves.toBeUndefined();

    const lines = loggedLines();
    expect(lines[0]).toMatch(/^Control9 NOTICE:/);
    expect(
      lines.some(
        (line) =>
          line.includes(`section_start:`) &&
          line.includes(DEPLOY_VERIFICATION_SECTION_ID) &&
          line.includes(deployPresentationExpectations.deployVerificationSectionHeading),
      ),
    ).toBe(true);
    expect(lines.some((line) => line.includes(DEPLOY_VERIFICATION_SECTION_HEADING))).toBe(true);

    const mrNoteCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/merge_requests/") &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    const mrNoteBody = JSON.parse(String(mrNoteCall?.[1]?.body)) as { body: string };
    expect(mrNoteBody.body).toContain(DEPLOY_VERIFICATION_SECTION_HEADING);
  });
});
