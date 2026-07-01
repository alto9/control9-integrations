import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  setOutput: vi.fn(),
  setFailed: vi.fn(),
  info: vi.fn(),
  notice: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@actions/core", () => coreMocks);

import { runAction } from "../src/index";
import {
  DEPLOY_VERIFICATION_SECTION_HEADING,
  SUMMARY_SECTION_HEADING,
} from "../src/github/workflow-summary";
import { OUTCOME_TEMPLATES } from "../src/rendering/templates";
import { Control9ActionError } from "../src/types";

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
  expectedSummaryPattern?: string;
}

interface RenderingFixture {
  decisionId: string;
  decisionKind: string;
  reason: string;
}

interface VerificationFixture {
  verificationId: string;
  verificationStatus: string;
  decisionId?: string;
  expectedFingerprint?: string;
  actualFingerprint?: string;
  reason?: string;
}

const denyFixture = JSON.parse(
  readFileSync("fixtures/rendering/deny-decision.json", "utf8"),
) as RenderingFixture;
const fingerprintMismatchFixture = JSON.parse(
  readFileSync("fixtures/verification/fingerprint-mismatch-response.json", "utf8"),
) as VerificationFixture;
const unavailableFixture = JSON.parse(
  readFileSync("fixtures/outcomes/unavailable-api-exhaustion.json", "utf8"),
) as { httpStatus: number; attempts: number };
const unavailableVerificationFixture = JSON.parse(
  readFileSync("fixtures/verification/unavailable-api-exhaustion.json", "utf8"),
) as { httpStatus: number; attempts: number };
const malformedPolicyFixture = JSON.parse(
  readFileSync("fixtures/outcomes/malformed-policy-response.json", "utf8"),
) as { httpStatus: number; body: Record<string, unknown> };
const malformedVerificationFixture = JSON.parse(
  readFileSync("fixtures/verification/malformed-response.json", "utf8"),
) as { httpStatus: number; body: Record<string, unknown> };

const scenarioFixtures = readdirSync("fixtures/outcomes/scenarios")
  .filter((fileName) => fileName.endsWith(".json"))
  .map((fileName) => ({
    fileName,
    scenario: JSON.parse(
      readFileSync(path.join("fixtures/outcomes/scenarios", fileName), "utf8"),
    ) as ScenarioFixture,
  }));

function getOutput(name: string): string | undefined {
  const call = coreMocks.setOutput.mock.calls.find(([key]) => key === name);
  return call?.[1] as string | undefined;
}

describe("fail-open vs protected enforce integration scenarios", () => {
  let tempDirectory: string;
  let stepSummaryPath: string;
  let previousEnv: NodeJS.ProcessEnv;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    previousEnv = { ...process.env };
    tempDirectory = mkdtempSync(path.join(tmpdir(), "control9-fail-open-"));
    stepSummaryPath = path.join(tempDirectory, "step-summary.md");
    writeFileSync(stepSummaryPath, "", "utf8");

    process.env.RUNNER_TEMP = tempDirectory;
    process.env.GITHUB_STEP_SUMMARY = stepSummaryPath;
    process.env.INPUT_MODE = "shadow";
    process.env.INPUT_CONTROL9_API_URL = "https://api.control9.example";
    process.env.INPUT_TENANT_ID = "tenant-integration";
    process.env.INPUT_SIGNING_SECRET = "integration-signing-secret";
    process.env.INPUT_TARGET_ENVIRONMENT = "staging";
    process.env.INPUT_REQUESTED_AUTHORITY = "plan";
    process.env.INPUT_IAC_TOOL = "terraform";
    process.env.INPUT_COMMAND = "plan";
    process.env.INPUT_ARTIFACT_PATHS = "fixtures/terraform/plan.json";
    process.env.INPUT_WORKING_DIRECTORY = ".";

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    coreMocks.setOutput.mockReset();
    coreMocks.setFailed.mockReset();
    coreMocks.info.mockReset();
    coreMocks.notice.mockReset();
    coreMocks.warning.mockReset();
  });

  afterEach(() => {
    process.env = previousEnv;
    vi.unstubAllGlobals();
  });

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
          Response.json(
            {
              decision_id: denyFixture.decisionId,
              decision_kind: denyFixture.decisionKind,
              reason: denyFixture.reason,
            },
            { status: 200 },
          ),
        );
        break;
      case "fingerprint_mismatch":
        fetchMock.mockResolvedValue(
          Response.json(
            {
              verification_id: fingerprintMismatchFixture.verificationId,
              verification_status: fingerprintMismatchFixture.verificationStatus,
              decision_id: fingerprintMismatchFixture.decisionId,
              expected_fingerprint: fingerprintMismatchFixture.expectedFingerprint,
              actual_fingerprint: fingerprintMismatchFixture.actualFingerprint,
              reason: fingerprintMismatchFixture.reason,
            },
            { status: 200 },
          ),
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

  async function expectScenarioOutcome(
    scenario: ScenarioFixture,
    mode: string,
  ): Promise<void> {
    applyScenario(scenario, mode);
    mockApiFailure(scenario);

    const summaryPattern = scenario.expectedSummaryPattern
      ? new RegExp(scenario.expectedSummaryPattern, "i")
      : undefined;

    if (scenario.expectedBlocks) {
      await expect(runAction()).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(Control9ActionError);
        if (summaryPattern) {
          expect((error as Control9ActionError).message).toMatch(summaryPattern);
        }
        return true;
      });
      expect(coreMocks.warning).toHaveBeenCalled();
    } else {
      await expect(runAction()).resolves.toBeUndefined();
      expect(coreMocks.setFailed).not.toHaveBeenCalled();
    }

    const summaryContent = readFileSync(stepSummaryPath, "utf8");
    if (scenario.expectedAdvisorySuffix) {
      expect(summaryContent).toMatch(new RegExp(scenario.expectedAdvisorySuffix, "i"));
    }

    if (scenario.command === "deploy-verification") {
      expect(summaryContent).toContain(DEPLOY_VERIFICATION_SECTION_HEADING);
      if (scenario.expectedOutputKind) {
        expect(getOutput("verification-status")).toBe(scenario.expectedOutputKind);
      }
    } else if (scenario.apiFailure !== "malformed_response") {
      expect(summaryContent).toContain(SUMMARY_SECTION_HEADING);
      if (scenario.expectedOutputKind) {
        expect(getOutput("decision-kind")).toBe(scenario.expectedOutputKind);
      }
    }

    if (scenario.apiFailure === "unavailable_api" && scenario.command !== "deploy-verification") {
      expect(summaryContent).toContain(OUTCOME_TEMPLATES.unavailable_api.title);
    }
  }

  it.each(
    scenarioFixtures.flatMap(({ fileName, scenario }) => {
      const modes = scenario.modes ?? (scenario.mode ? [scenario.mode] : []);
      return modes.map((mode) => [`${fileName} (${mode})`, scenario, mode] as const);
    }),
  )("%s", async (_label, scenario, mode) => {
    await expectScenarioOutcome(scenario, mode);
  });

  it("blocks enforce mode when deploy verification API is unavailable on a protected target", async () => {
    process.env.INPUT_COMMAND = "deploy-verification";
    process.env.INPUT_REQUESTED_AUTHORITY = "apply";
    process.env.INPUT_MODE = "enforce";
    process.env.INPUT_TARGET_ENVIRONMENT = "production";
    delete process.env.INPUT_FAIL_OPEN_ENVIRONMENTS;

    fetchMock.mockResolvedValue(
      new Response("service unavailable", {
        status: unavailableVerificationFixture.httpStatus,
      }),
    );

    await expect(runAction()).rejects.toBeInstanceOf(Control9ActionError);
    expect(getOutput("verification-status")).toBe("unavailable_api");
    expect(readFileSync(stepSummaryPath, "utf8")).toContain(
      OUTCOME_TEMPLATES.unavailable_api.title,
    );
  });

  it("continues enforce mode when deploy verification API is unavailable on a fail-open target", async () => {
    process.env.INPUT_COMMAND = "deploy-verification";
    process.env.INPUT_REQUESTED_AUTHORITY = "apply";
    process.env.INPUT_MODE = "enforce";
    process.env.INPUT_TARGET_ENVIRONMENT = "staging";
    process.env.INPUT_FAIL_OPEN_ENVIRONMENTS = "staging";

    fetchMock.mockResolvedValue(
      new Response("service unavailable", {
        status: unavailableVerificationFixture.httpStatus,
      }),
    );

    await expect(runAction()).resolves.toBeUndefined();
    expect(getOutput("verification-status")).toBe("unavailable_api");
    expect(readFileSync(stepSummaryPath, "utf8")).toMatch(
      /configured to fail open on API unavailability/i,
    );
  });

  it.each(["shadow", "enforce"] as const)(
    "blocks on malformed deploy-verification responses in %s mode",
    async (mode) => {
      process.env.INPUT_COMMAND = "deploy-verification";
      process.env.INPUT_REQUESTED_AUTHORITY = "apply";
      process.env.INPUT_MODE = mode;
      process.env.INPUT_TARGET_ENVIRONMENT = "staging";
      process.env.INPUT_FAIL_OPEN_ENVIRONMENTS = "staging";

      fetchMock.mockResolvedValue(
        Response.json(malformedVerificationFixture.body, {
          status: malformedVerificationFixture.httpStatus,
        }),
      );

      await expect(runAction()).rejects.toBeInstanceOf(Control9ActionError);
      expect(getOutput("verification-status")).toBe("malformed_response");
    },
  );
});
