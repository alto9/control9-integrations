import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

interface RenderingFixture {
  decisionId: string;
  decisionKind: string;
  reason: string;
  riskSummary?: string;
  policyVersion?: string;
  followUp?: Record<string, unknown>;
}

interface MalformedOutcomeFixture {
  httpStatus: number;
  body: Record<string, unknown>;
  expectedFailureKind: string;
  expectedDetailPattern: string;
}

interface VerificationFixture {
  verificationId: string;
  verificationStatus: string;
  decisionId?: string;
  expectedFingerprint?: string;
  actualFingerprint?: string;
  reason?: string;
}

interface MalformedVerificationFixture {
  httpStatus: number;
  body: Record<string, unknown>;
  expectedFailureKind: string;
  expectedDetailPattern: string;
}

interface UnavailableOutcomeFixture {
  httpStatus: number;
  attempts: number;
  expectedFailureKind: string;
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
const observeFixture = JSON.parse(
  readFileSync("fixtures/rendering/observe-decision.json", "utf8"),
) as RenderingFixture;
const malformedFixture = JSON.parse(
  readFileSync("fixtures/outcomes/malformed-policy-response.json", "utf8"),
) as MalformedOutcomeFixture;
const unavailableFixture = JSON.parse(
  readFileSync("fixtures/outcomes/unavailable-api-exhaustion.json", "utf8"),
) as UnavailableOutcomeFixture;
const verifiedFixture = JSON.parse(
  readFileSync("fixtures/verification/verified-response.json", "utf8"),
) as VerificationFixture;
const fingerprintMismatchFixture = JSON.parse(
  readFileSync("fixtures/verification/fingerprint-mismatch-response.json", "utf8"),
) as VerificationFixture;
const noApprovedBaselineFixture = JSON.parse(
  readFileSync("fixtures/verification/no-approved-baseline-response.json", "utf8"),
) as VerificationFixture;
const malformedVerificationFixture = JSON.parse(
  readFileSync("fixtures/verification/malformed-response.json", "utf8"),
) as MalformedVerificationFixture;
const unavailableVerificationFixture = JSON.parse(
  readFileSync("fixtures/verification/unavailable-api-exhaustion.json", "utf8"),
) as UnavailableOutcomeFixture;

const UNSAFE_PATTERNS = [
  /BEGIN RSA PRIVATE KEY/,
  /ghp_[A-Za-z0-9]+/,
  /AKIA[0-9A-Z]{16}/,
  /super-secret-token-value/,
  /process\.env/,
  /"Resources":/,
];

function expectSafeContent(content: string): void {
  for (const pattern of UNSAFE_PATTERNS) {
    expect(content).not.toMatch(pattern);
  }
}

function policyApiBody(fixture: RenderingFixture): Record<string, unknown> {
  return {
    decision_id: fixture.decisionId,
    decision_kind: fixture.decisionKind,
    reason: fixture.reason,
    ...(fixture.riskSummary ? { risk_summary: fixture.riskSummary } : {}),
    ...(fixture.policyVersion ? { policy_version: fixture.policyVersion } : {}),
    ...(fixture.followUp ? { follow_up: fixture.followUp } : {}),
  };
}

function getOutput(name: string): string | undefined {
  const call = coreMocks.setOutput.mock.calls.find(([key]) => key === name);
  return call?.[1] as string | undefined;
}

describe("runAction outcome integration", () => {
  let tempDirectory: string;
  let stepSummaryPath: string;
  let previousEnv: NodeJS.ProcessEnv;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    previousEnv = { ...process.env };
    tempDirectory = mkdtempSync(path.join(tmpdir(), "control9-run-action-"));
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

  function mockPolicySuccess(fixture: RenderingFixture): void {
    fetchMock.mockResolvedValue(
      Response.json(policyApiBody(fixture), { status: 200 }),
    );
  }

  function mockVerificationSuccess(fixture: VerificationFixture): void {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          verification_id: fixture.verificationId,
          verification_status: fixture.verificationStatus,
          ...(fixture.decisionId ? { decision_id: fixture.decisionId } : {}),
          ...(fixture.expectedFingerprint
            ? { expected_fingerprint: fixture.expectedFingerprint }
            : {}),
          ...(fixture.actualFingerprint
            ? { actual_fingerprint: fixture.actualFingerprint }
            : {}),
          ...(fixture.reason ? { reason: fixture.reason } : {}),
        },
        { status: 200 },
      ),
    );
  }

  function configureDeployVerificationInputs(): void {
    process.env.INPUT_COMMAND = "deploy-verification";
    process.env.INPUT_REQUESTED_AUTHORITY = "apply";
    process.env.INPUT_IAC_TOOL = "terraform";
    process.env.INPUT_ARTIFACT_PATHS = "fixtures/terraform/plan.json";
  }

  function mockUnavailableApiExhaustion(): void {
    fetchMock.mockResolvedValue(
      new Response("service unavailable", { status: unavailableFixture.httpStatus }),
    );
  }

  function mockMalformedPolicyResponse(): void {
    fetchMock.mockResolvedValue(
      Response.json(malformedFixture.body, { status: malformedFixture.httpStatus }),
    );
  }

  function mockMalformedVerificationResponse(): void {
    fetchMock.mockResolvedValue(
      Response.json(malformedVerificationFixture.body, {
        status: malformedVerificationFixture.httpStatus,
      }),
    );
  }

  function mockUnavailableVerificationApiExhaustion(): void {
    fetchMock.mockResolvedValue(
      new Response("service unavailable", {
        status: unavailableVerificationFixture.httpStatus,
      }),
    );
  }

  function expectDeployVerificationFeedback(
    summaryContent: string,
    verificationStatus: keyof typeof OUTCOME_TEMPLATES,
  ): void {
    expect(summaryContent).toContain(DEPLOY_VERIFICATION_SECTION_HEADING);
    expect(summaryContent).not.toContain(SUMMARY_SECTION_HEADING);
    expect(summaryContent).toContain(OUTCOME_TEMPLATES[verificationStatus].title);
  }

  function expectArtifactFingerprintOutput(): void {
    const fingerprint = getOutput("artifact-fingerprint");
    expect(fingerprint).toBeTruthy();
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  }

  async function expectRunCompletes(): Promise<void> {
    await expect(runAction()).resolves.toBeUndefined();
  }

  async function expectRunBlocks(expectedSummaryPattern: RegExp): Promise<void> {
    await expect(runAction()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(Control9ActionError);
      expect((error as Control9ActionError).message).toMatch(expectedSummaryPattern);
      return true;
    });
  }

  it.each([
    ["allow", allowFixture, "allow"],
    ["deny", denyFixture, "deny"],
    ["require_approval", requireApprovalFixture, "require_approval"],
    ["observe", observeFixture, "observe"],
  ] as const)(
    "completes successful %s policy decisions in shadow mode with expected outputs and feedback",
    async (_label, fixture, decisionKind) => {
      process.env.INPUT_MODE = "shadow";
      mockPolicySuccess(fixture);

      await expectRunCompletes();

      expect(getOutput("decision-kind")).toBe(decisionKind);
      expect(getOutput("decision-id")).toBe(fixture.decisionId);
      expect(getOutput("summary-written")).toBe("true");

      const summaryContent = readFileSync(stepSummaryPath, "utf8");
      expect(summaryContent).toContain(SUMMARY_SECTION_HEADING);
      expect(summaryContent).toContain(OUTCOME_TEMPLATES[decisionKind].title);
      expect(summaryContent).toContain(fixture.reason);
      expectSafeContent(summaryContent);

      const annotationCall = coreMocks.notice.mock.calls[0] ?? coreMocks.warning.mock.calls[0];
      expect(annotationCall?.[1]?.title).toBe(OUTCOME_TEMPLATES[decisionKind].label);

      const summaryJson = readFileSync(getOutput("summary-path") ?? "", "utf8");
      expect(summaryJson).toContain(`"decisionKind": "${decisionKind}"`);
      expect(summaryJson).toContain('"status": "submitted"');
    },
  );

  it.each([
    ["deny", denyFixture, /Policy restriction triggered/i],
    ["require_approval", requireApprovalFixture, /requires approval before deploy authority/i],
  ] as const)(
    "blocks enforce-mode %s decisions after publishing workflow feedback",
    async (_label, fixture, summaryPattern) => {
      process.env.INPUT_MODE = "enforce";
      process.env.INPUT_TARGET_ENVIRONMENT = "production";
      mockPolicySuccess(fixture);

      await expectRunBlocks(summaryPattern);

      expect(getOutput("decision-kind")).toBe(fixture.decisionKind);
      expect(getOutput("decision-id")).toBe(fixture.decisionId);
      expect(getOutput("summary-written")).toBe("true");
      expect(coreMocks.warning).toHaveBeenCalled();

      const summaryContent = readFileSync(stepSummaryPath, "utf8");
      expect(summaryContent).toContain(
        OUTCOME_TEMPLATES[fixture.decisionKind as keyof typeof OUTCOME_TEMPLATES].title,
      );
      expect(coreMocks.warning.mock.calls[0]?.[1]?.title).toBe(
        OUTCOME_TEMPLATES[fixture.decisionKind as keyof typeof OUTCOME_TEMPLATES].label,
      );
    },
  );

  it("does not block deny or require_approval decisions in shadow mode", async () => {
    for (const fixture of [denyFixture, requireApprovalFixture]) {
      coreMocks.setOutput.mockClear();
      coreMocks.warning.mockClear();
      writeFileSync(stepSummaryPath, "", "utf8");
      process.env.INPUT_MODE = "shadow";
      mockPolicySuccess(fixture);

      await expectRunCompletes();

      expect(getOutput("decision-kind")).toBe(fixture.decisionKind);
      const summaryContent = readFileSync(stepSummaryPath, "utf8");
      expect(summaryContent).toMatch(/Shadow mode is active/i);
      expect(coreMocks.notice).toHaveBeenCalled();
      expect(coreMocks.warning).not.toHaveBeenCalled();
    }
  });

  it("continues in shadow mode when the policy API is unavailable after retries", async () => {
    process.env.INPUT_MODE = "shadow";
    mockUnavailableApiExhaustion();

    await expectRunCompletes();

    expect(fetchMock).toHaveBeenCalledTimes(unavailableFixture.attempts);
    expect(getOutput("decision-kind")).toBe(unavailableFixture.expectedFailureKind);
    expect(getOutput("decision-id")).toBe("");

    const summaryContent = readFileSync(stepSummaryPath, "utf8");
    expect(summaryContent).toContain(OUTCOME_TEMPLATES.unavailable_api.title);
    expect(summaryContent).toMatch(/could not reach the policy API/i);
    expect(summaryContent).toMatch(/Shadow mode is active/i);
    expect(coreMocks.notice.mock.calls[0]?.[1]?.title).toBe(
      OUTCOME_TEMPLATES.unavailable_api.label,
    );

    const summaryJson = readFileSync(getOutput("summary-path") ?? "", "utf8");
    expect(summaryJson).toContain('"status": "submission_failed"');
    expect(summaryJson).toContain(`"decisionKind": "${unavailableFixture.expectedFailureKind}"`);
  });

  it("blocks enforce mode when the policy API is unavailable after retries", async () => {
    process.env.INPUT_MODE = "enforce";
    process.env.INPUT_TARGET_ENVIRONMENT = "production";
    mockUnavailableApiExhaustion();

    await expectRunBlocks(/could not reach the policy API/i);

    expect(getOutput("decision-kind")).toBe("unavailable_api");
    expect(coreMocks.warning).toHaveBeenCalled();
    expect(readFileSync(stepSummaryPath, "utf8")).toContain(
      OUTCOME_TEMPLATES.unavailable_api.title,
    );
    expect(coreMocks.warning.mock.calls[0]?.[1]?.title).toBe(
      OUTCOME_TEMPLATES.unavailable_api.label,
    );
  });

  it.each(["shadow", "enforce"] as const)(
    "always blocks on malformed policy responses in %s mode",
    async (mode) => {
      process.env.INPUT_MODE = mode;
      mockMalformedPolicyResponse();

      await expectRunBlocks(/could not be normalized/i);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getOutput("decision-kind")).toBe(malformedFixture.expectedFailureKind);
      expect(getOutput("decision-id")).toBe("");

      const summaryContent = readFileSync(stepSummaryPath, "utf8");
      expect(summaryContent).toContain(OUTCOME_TEMPLATES.malformed_response.title);
      expect(summaryContent).toMatch(new RegExp(malformedFixture.expectedDetailPattern, "i"));
      expect(coreMocks.warning.mock.calls[0]?.[1]?.title).toBe(
        OUTCOME_TEMPLATES.malformed_response.label,
      );

      const summaryJson = readFileSync(getOutput("summary-path") ?? "", "utf8");
      expect(summaryJson).toContain('"status": "submission_failed"');
    },
  );

  it("never renders unsafe malformed follow-up metadata in workflow feedback", async () => {
    const unsafeFixture: RenderingFixture = {
      decisionId: "dec-unsafe-follow-up",
      decisionKind: "require_approval",
      reason: "Approval required for risky change.",
      followUp: {
        leaked_secret: "super-secret-token-value",
        private_key: "-----BEGIN RSA PRIVATE KEY-----",
        envelope: { Resources: { Bucket: { Type: "AWS::S3::Bucket" } } },
        approval_url: "https://control9.example/approve/dec-unsafe-follow-up",
      },
    };

    process.env.INPUT_MODE = "shadow";
    mockPolicySuccess(unsafeFixture);

    await expectRunCompletes();

    const summaryContent = readFileSync(stepSummaryPath, "utf8");
    expectSafeContent(summaryContent);
    expect(summaryContent).toContain("https://control9.example/approve/dec-unsafe-follow-up");
    expect(summaryContent).not.toContain("leaked_secret");
    expect(summaryContent).not.toContain("private_key");
  });

  it("fails the matrix when outcome routing is bypassed in action outputs", async () => {
    mockPolicySuccess(denyFixture);
    process.env.INPUT_MODE = "enforce";
    process.env.INPUT_TARGET_ENVIRONMENT = "production";

    await expectRunBlocks(/Policy restriction triggered/i);

    expect(getOutput("decision-kind")).not.toBe("allow");
    expect(getOutput("decision-kind")).toBe("deny");
  });

  describe("deploy-verification command", () => {
    beforeEach(() => {
      configureDeployVerificationInputs();
    });

    it("calls the deploy verification API instead of the policy API", async () => {
      mockVerificationSuccess(verifiedFixture);

      await expectRunCompletes();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/deploy-verifications");
      expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("/v1/action-envelopes");
    });

    it.each([
      ["verified", verifiedFixture],
      ["fingerprint_mismatch", fingerprintMismatchFixture],
      ["no_approved_baseline", noApprovedBaselineFixture],
    ] as const)(
      "completes successful %s verification in shadow mode with deploy verification feedback",
      async (_label, fixture) => {
        process.env.INPUT_MODE = "shadow";
        mockVerificationSuccess(fixture);

        await expectRunCompletes();

        expect(getOutput("verification-status")).toBe(fixture.verificationStatus);
        expect(getOutput("verification-id")).toBe(fixture.verificationId);
        expect(getOutput("decision-kind")).toBe("");
        expectArtifactFingerprintOutput();

        const summaryContent = readFileSync(stepSummaryPath, "utf8");
        expectDeployVerificationFeedback(summaryContent, fixture.verificationStatus);
        expect(coreMocks.notice.mock.calls.at(-1)?.[1]?.title).toBe(
          OUTCOME_TEMPLATES[fixture.verificationStatus].label,
        );
      },
    );

    it("completes verified deploy verification in enforce mode with expected outputs and feedback", async () => {
      process.env.INPUT_MODE = "enforce";
      process.env.INPUT_TARGET_ENVIRONMENT = "production";
      mockVerificationSuccess(verifiedFixture);

      await expectRunCompletes();

      expect(getOutput("verification-status")).toBe("verified");
      expect(getOutput("verification-id")).toBe(verifiedFixture.verificationId);
      expectArtifactFingerprintOutput();

      const summaryContent = readFileSync(stepSummaryPath, "utf8");
      expectDeployVerificationFeedback(summaryContent, "verified");
      expect(coreMocks.notice).toHaveBeenCalled();
      expect(coreMocks.warning).not.toHaveBeenCalled();
    });

    it.each([
      ["fingerprint_mismatch", fingerprintMismatchFixture, /does not match the approved fingerprint/i],
      ["no_approved_baseline", noApprovedBaselineFixture, /No approved fingerprint exists/i],
    ] as const)(
      "blocks enforce-mode %s verification after publishing workflow feedback",
      async (_label, fixture, summaryPattern) => {
        process.env.INPUT_MODE = "enforce";
        process.env.INPUT_TARGET_ENVIRONMENT = "production";
        mockVerificationSuccess(fixture);

        await expectRunBlocks(summaryPattern);

        expect(getOutput("verification-status")).toBe(fixture.verificationStatus);
        expect(getOutput("verification-id")).toBe(fixture.verificationId);
        expect(getOutput("summary-written")).toBe("true");
        expectArtifactFingerprintOutput();

        const summaryContent = readFileSync(stepSummaryPath, "utf8");
        expectDeployVerificationFeedback(summaryContent, fixture.verificationStatus);
        expect(coreMocks.warning.mock.calls[0]?.[1]?.title).toBe(
          OUTCOME_TEMPLATES[fixture.verificationStatus].label,
        );
      },
    );

    it("does not block fingerprint mismatch or no approved baseline in shadow mode", async () => {
      for (const fixture of [fingerprintMismatchFixture, noApprovedBaselineFixture]) {
        coreMocks.setOutput.mockClear();
        coreMocks.warning.mockClear();
        writeFileSync(stepSummaryPath, "", "utf8");
        process.env.INPUT_MODE = "shadow";
        mockVerificationSuccess(fixture);

        await expectRunCompletes();

        expect(getOutput("verification-status")).toBe(fixture.verificationStatus);
        expectArtifactFingerprintOutput();

        const summaryContent = readFileSync(stepSummaryPath, "utf8");
        expectDeployVerificationFeedback(summaryContent, fixture.verificationStatus);
        expect(summaryContent).toMatch(/Shadow mode is active/i);
        expect(coreMocks.notice).toHaveBeenCalled();
        expect(coreMocks.warning).not.toHaveBeenCalled();
      }
    });

    it("continues in shadow mode when the verification API is unavailable after retries", async () => {
      process.env.INPUT_MODE = "shadow";
      mockUnavailableVerificationApiExhaustion();

      await expectRunCompletes();

      expect(fetchMock).toHaveBeenCalledTimes(unavailableVerificationFixture.attempts);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/deploy-verifications");
      expect(getOutput("verification-status")).toBe(
        unavailableVerificationFixture.expectedFailureKind,
      );
      expect(getOutput("verification-id")).toBe("");
      expectArtifactFingerprintOutput();

      const summaryContent = readFileSync(stepSummaryPath, "utf8");
      expectDeployVerificationFeedback(summaryContent, "unavailable_api");
      expect(summaryContent).toMatch(/could not reach the policy API/i);
      expect(summaryContent).toMatch(/Shadow mode is active/i);
      expect(coreMocks.notice.mock.calls[0]?.[1]?.title).toBe(
        OUTCOME_TEMPLATES.unavailable_api.label,
      );
    });

    it("blocks enforce mode when the verification API is unavailable after retries", async () => {
      process.env.INPUT_MODE = "enforce";
      process.env.INPUT_TARGET_ENVIRONMENT = "production";
      mockUnavailableVerificationApiExhaustion();

      await expectRunBlocks(/could not reach the policy API/i);

      expect(getOutput("verification-status")).toBe("unavailable_api");
      expect(getOutput("verification-id")).toBe("");
      expect(coreMocks.warning).toHaveBeenCalled();
      expect(readFileSync(stepSummaryPath, "utf8")).toContain(
        OUTCOME_TEMPLATES.unavailable_api.title,
      );
      expect(coreMocks.warning.mock.calls[0]?.[1]?.title).toBe(
        OUTCOME_TEMPLATES.unavailable_api.label,
      );
    });

    it.each(["shadow", "enforce"] as const)(
      "always blocks on malformed verification responses in %s mode",
      async (mode) => {
        process.env.INPUT_MODE = mode;
        mockMalformedVerificationResponse();

        await expectRunBlocks(/missing verification status/i);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(getOutput("verification-status")).toBe(
          malformedVerificationFixture.expectedFailureKind,
        );
        expect(getOutput("verification-id")).toBe("");

        const summaryContent = readFileSync(stepSummaryPath, "utf8");
        expectDeployVerificationFeedback(summaryContent, "malformed_response");
        expect(summaryContent).toMatch(
          new RegExp(malformedVerificationFixture.expectedDetailPattern, "i"),
        );
        expect(coreMocks.warning.mock.calls[0]?.[1]?.title).toBe(
          OUTCOME_TEMPLATES.malformed_response.label,
        );
      },
    );
  });
});
