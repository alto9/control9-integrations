import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runGitLabAssessment } from "../src/gitlab/runner";
import { OUTCOME_TEMPLATES } from "../src/rendering/templates";
import { Control9ActionError } from "../src/types";

interface RenderingFixture {
  decisionId: string;
  decisionKind: string;
  reason: string;
}

interface ScenarioFixture {
  description: string;
  command?: string;
  mode?: string;
  modes?: string[];
  targetEnvironment?: string;
  failOpenEnvironments?: string;
  apiFailure: string;
  expectedBlocks: boolean;
  expectedOutputKind?: string;
  expectedAdvisorySuffix?: string;
}

const allowFixture = JSON.parse(
  readFileSync("fixtures/rendering/allow-decision.json", "utf8"),
) as RenderingFixture;
const denyFixture = JSON.parse(
  readFileSync("fixtures/rendering/deny-decision.json", "utf8"),
) as RenderingFixture;
const requireApprovalFixture = JSON.parse(
  readFileSync("fixtures/rendering/require-approval-decision.json", "utf8"),
) as RenderingFixture;
const unavailableFixture = JSON.parse(
  readFileSync("fixtures/outcomes/unavailable-api-exhaustion.json", "utf8"),
) as { httpStatus: number; attempts: number };
const malformedPolicyFixture = JSON.parse(
  readFileSync("fixtures/outcomes/malformed-policy-response.json", "utf8"),
) as { httpStatus: number; body: Record<string, unknown> };

const scenarioFixtures = readdirSync("fixtures/outcomes/scenarios")
  .filter((fileName) => fileName.endsWith(".json"))
  .map((fileName) => ({
    fileName,
    scenario: JSON.parse(
      readFileSync(path.join("fixtures/outcomes/scenarios", fileName), "utf8"),
    ) as ScenarioFixture,
  }));

function applyGitLabBaseEnv(tempDirectory: string): void {
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

describe("runGitLabAssessment outcome integration", () => {
  let tempDirectory: string;
  let previousEnv: NodeJS.ProcessEnv;
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    previousEnv = { ...process.env };
    tempDirectory = mkdtempSync(path.join(tmpdir(), "control9-gitlab-outcomes-"));
    writeFileSync(path.join(tempDirectory, "placeholder"), "", "utf8");
    applyGitLabBaseEnv(tempDirectory);
    process.env.INPUT_MODE = "shadow";

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = previousEnv;
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    errorSpy.mockRestore();
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

  function applyScenario(scenario: ScenarioFixture, mode: string): void {
    process.env.INPUT_MODE = mode;
    if (scenario.command === "deploy-verification") {
      process.env.INPUT_COMMAND = "deploy-verification";
      process.env.INPUT_REQUESTED_AUTHORITY = "apply";
    } else {
      process.env.INPUT_COMMAND = "plan";
      process.env.INPUT_REQUESTED_AUTHORITY = "plan";
    }
    if (scenario.targetEnvironment) {
      process.env.INPUT_TARGET_ENVIRONMENT = scenario.targetEnvironment;
    }
    if (scenario.failOpenEnvironments !== undefined) {
      process.env.INPUT_FAIL_OPEN_ENVIRONMENTS = scenario.failOpenEnvironments;
    } else {
      delete process.env.INPUT_FAIL_OPEN_ENVIRONMENTS;
    }
  }

  function mockApiFailure(scenario: ScenarioFixture): void {
    switch (scenario.apiFailure) {
      case "unavailable_api":
        fetchMock.mockResolvedValue(
          new Response("service unavailable", { status: unavailableFixture.httpStatus }),
        );
        break;
      case "deny_decision":
        fetchMock.mockResolvedValue(
          Response.json({
            decision_id: denyFixture.decisionId,
            decision_kind: denyFixture.decisionKind,
            reason: denyFixture.reason,
          }),
        );
        break;
      case "malformed_response":
        fetchMock.mockResolvedValue(
          Response.json(malformedPolicyFixture.body, {
            status: malformedPolicyFixture.httpStatus,
          }),
        );
        break;
      default:
        throw new Error(`Unsupported apiFailure fixture value: ${scenario.apiFailure}`);
    }
  }

  async function expectScenarioOutcome(scenario: ScenarioFixture, mode: string): Promise<void> {
    applyScenario(scenario, mode);
    mockApiFailure(scenario);

    const summaryPath = path.join(tempDirectory, "control9-summary.json");

    if (scenario.expectedBlocks) {
      await expect(runGitLabAssessment()).rejects.toBeInstanceOf(Control9ActionError);
    } else {
      await expect(runGitLabAssessment()).resolves.toBeUndefined();
    }

    const summaryContent = readFileSync(summaryPath, "utf8");
    if (scenario.expectedAdvisorySuffix) {
      expect(summaryContent).toMatch(new RegExp(scenario.expectedAdvisorySuffix, "i"));
    }
    if (scenario.apiFailure === "unavailable_api" && scenario.command !== "deploy-verification") {
      expect(summaryContent).toContain('"decisionKind": "unavailable_api"');
    }
  }

  it.each([
    ["allow", allowFixture],
    ["deny", denyFixture],
    ["require_approval", requireApprovalFixture],
  ] as const)(
    "completes shadow-mode %s decisions with advisory log output and exit 0",
    async (_label, fixture) => {
      process.env.INPUT_MODE = "shadow";
      mockPolicySuccess(fixture);

      await expect(runGitLabAssessment()).resolves.toBeUndefined();

      const summaryPath = path.join(tempDirectory, "control9-summary.json");
      const summaryContent = readFileSync(summaryPath, "utf8");
      expect(summaryContent).toContain(`"decisionKind": "${fixture.decisionKind}"`);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          OUTCOME_TEMPLATES[fixture.decisionKind as keyof typeof OUTCOME_TEMPLATES].label,
        ),
      );
    },
  );

  it.each([
    ["deny", denyFixture, /Policy restriction triggered/i],
    ["require_approval", requireApprovalFixture, /requires approval before deploy authority/i],
  ] as const)(
    "blocks enforce-mode %s decisions with non-zero workflow outcome",
    async (_label, fixture, summaryPattern) => {
      process.env.INPUT_MODE = "enforce";
      process.env.INPUT_TARGET_ENVIRONMENT = "production";
      mockPolicySuccess(fixture);

      await expect(runGitLabAssessment()).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(Control9ActionError);
        expect((error as Control9ActionError).message).toMatch(summaryPattern);
        return true;
      });
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          OUTCOME_TEMPLATES[fixture.decisionKind as keyof typeof OUTCOME_TEMPLATES].label,
        ),
      );
    },
  );

  it.each(["shadow", "enforce"] as const)(
    "blocks on malformed policy responses in %s mode",
    async (mode) => {
      process.env.INPUT_MODE = mode;
      fetchMock.mockResolvedValue(
        Response.json(malformedPolicyFixture.body, {
          status: malformedPolicyFixture.httpStatus,
        }),
      );

      await expect(runGitLabAssessment()).rejects.toBeInstanceOf(Control9ActionError);

      const summaryPath = path.join(tempDirectory, "control9-summary.json");
      expect(readFileSync(summaryPath, "utf8")).toContain('"decisionKind": "malformed_response"');
    },
  );

  it.each(
    scenarioFixtures.flatMap(({ fileName, scenario }) => {
      if (scenario.command === "deploy-verification") {
        return [];
      }
      const modes = scenario.modes ?? (scenario.mode ? [scenario.mode] : []);
      return modes.map((mode) => [`${fileName} (${mode})`, scenario, mode] as const);
    }),
  )("%s", async (_label, scenario, mode) => {
    await expectScenarioOutcome(scenario, mode);
  });

  it("blocks enforce mode when the policy API is unavailable on a protected target", async () => {
    process.env.INPUT_MODE = "enforce";
    process.env.INPUT_TARGET_ENVIRONMENT = "production";
    delete process.env.INPUT_FAIL_OPEN_ENVIRONMENTS;

    fetchMock.mockResolvedValue(
      new Response("service unavailable", { status: unavailableFixture.httpStatus }),
    );

    await expect(runGitLabAssessment()).rejects.toBeInstanceOf(Control9ActionError);
    expect(readFileSync(path.join(tempDirectory, "control9-summary.json"), "utf8")).toContain(
      '"decisionKind": "unavailable_api"',
    );
  });

  it("continues enforce mode when the policy API is unavailable on a fail-open target", async () => {
    process.env.INPUT_MODE = "enforce";
    process.env.INPUT_TARGET_ENVIRONMENT = "staging";
    process.env.INPUT_FAIL_OPEN_ENVIRONMENTS = "staging";

    fetchMock.mockResolvedValue(
      new Response("service unavailable", { status: unavailableFixture.httpStatus }),
    );

    await expect(runGitLabAssessment()).resolves.toBeUndefined();
    expect(readFileSync(path.join(tempDirectory, "control9-summary.json"), "utf8")).toMatch(
      /configured to fail open on API unavailability/i,
    );
  });
});
