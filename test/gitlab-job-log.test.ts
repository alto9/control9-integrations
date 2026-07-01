import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEPLOY_VERIFICATION_SECTION_HEADING,
  SUMMARY_SECTION_HEADING,
} from "../src/github/workflow-summary";
import {
  DEPLOY_VERIFICATION_SECTION_ID,
  DISABLE_SECTION_MARKERS_ENV,
  POLICY_SECTION_ID,
  buildLogFallbackLines,
  buildLogPrefixLine,
  buildSectionBodyLines,
  buildSectionEndMarker,
  buildSectionStartMarker,
  publishGitLabJobFeedback,
  publishGitLabPresentationFeedback,
  writeGitLabPresentationOutputs,
} from "../src/gitlab/job-log";
import { renderDecisionFeedback } from "../src/rendering/decision-renderer";
import * as mrNoteModule from "../src/gitlab/mr-note";

interface PolicyPresentationScenario {
  label: string;
  decisionFixture: string;
  runtimeMode: "shadow" | "enforce";
  blocksWorkflow: boolean;
  expectedLogPrefix: string;
  expectedSectionHeading: string;
}

interface PolicyPresentationExpectations {
  scenarios: PolicyPresentationScenario[];
}

const policyPresentationExpectations = JSON.parse(
  readFileSync("fixtures/gitlab/policy-presentation-expectations.json", "utf8"),
) as PolicyPresentationExpectations;

function loadDecisionFixture(fixturePath: string) {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as {
    decisionId: string;
    decisionKind: string;
    reason: string;
    targetEnvironment?: string;
  };
}

describe("buildLogPrefixLine", () => {
  it.each(policyPresentationExpectations.scenarios)(
    "uses $expectedLogPrefix for $label at the presentation layer",
    (scenario) => {
      const fixture = loadDecisionFixture(scenario.decisionFixture);
      const rendered = renderDecisionFeedback({
        kind: "policy_decision",
        decision: {
          decisionId: fixture.decisionId,
          decisionKind: fixture.decisionKind as "allow" | "deny" | "require_approval",
          reason: fixture.reason,
        },
        runtimeMode: scenario.runtimeMode,
        targetEnvironment: fixture.targetEnvironment,
      });

      expect(rendered.blocksWorkflow).toBe(scenario.blocksWorkflow);
      expect(buildLogPrefixLine(rendered).startsWith(scenario.expectedLogPrefix)).toBe(true);
    },
  );

  it("uses notice prefix for non-blocking outcomes and warning prefix for blocking outcomes", () => {
    const nonBlocking = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        decisionId: "dec-allow",
        decisionKind: "allow",
        reason: "Change approved.",
      },
      runtimeMode: "shadow",
      targetEnvironment: "staging",
    });
    const blocking = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        decisionId: "dec-deny",
        decisionKind: "deny",
        reason: "Policy restriction triggered.",
      },
      runtimeMode: "enforce",
      targetEnvironment: "production",
    });

    expect(buildLogPrefixLine(nonBlocking)).toBe(
      `Control9 NOTICE: ${nonBlocking.annotationMessage}`,
    );
    expect(buildLogPrefixLine(blocking)).toBe(
      `Control9 WARNING: ${blocking.annotationMessage}`,
    );
  });
});

describe("GitLab section markers", () => {
  it("formats section_start and section_end with stable section ids", () => {
    expect(buildSectionStartMarker(POLICY_SECTION_ID, SUMMARY_SECTION_HEADING, 1_560_896_352)).toBe(
      `\u001b[0Ksection_start:1560896352:control9-policy-decision\r\u001b[0K${SUMMARY_SECTION_HEADING}`,
    );
    expect(buildSectionEndMarker(POLICY_SECTION_ID, 1_560_896_353)).toBe(
      "\u001b[0Ksection_end:1560896353:control9-policy-decision\r\u001b[0K",
    );
    expect(
      buildSectionStartMarker(
        DEPLOY_VERIFICATION_SECTION_ID,
        DEPLOY_VERIFICATION_SECTION_HEADING,
        99,
      ),
    ).toContain(`section_start:99:${DEPLOY_VERIFICATION_SECTION_ID}`);
  });

  it("builds section body lines matching GitHub summary content", () => {
    const rendered = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        decisionId: "dec-observe-1",
        decisionKind: "observe",
        reason: "Advisory finding.",
      },
      runtimeMode: "shadow",
    });

    const lines = buildSectionBodyLines(rendered);

    expect(lines).toContain(`## ${rendered.title}`);
    expect(lines).toContain(rendered.summary);
    expect(lines.some((line) => line.startsWith("- Decision kind:"))).toBe(true);
    expect(lines.some((line) => line === `## ${SUMMARY_SECTION_HEADING}`)).toBe(false);
  });
});

describe("publishGitLabJobFeedback", () => {
  it("emits prefix, section markers, and body lines when sections are enabled", () => {
    const rendered = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        decisionId: "dec-allow",
        decisionKind: "allow",
        reason: "Allowed.",
      },
    });
    const log = vi.fn();

    const result = publishGitLabJobFeedback(
      { rendered, summaryPath: "/tmp/control9-summary.json" },
      {
        log,
        canWriteSections: () => true,
        nowSeconds: () => 1_700_000_000,
      },
    );

    expect(result).toEqual({ sectionWritten: true, usedLogFallback: false });
    const logged = log.mock.calls.map(([line]) => String(line));
    expect(logged[0]).toBe(`Control9 NOTICE: ${rendered.annotationMessage}`);
    expect(logged[1]).toContain(`section_start:1700000000:${POLICY_SECTION_ID}`);
    expect(logged.some((line) => line.includes(rendered.title))).toBe(true);
    expect(logged.at(-2)).toContain(`section_end:1700000001:${POLICY_SECTION_ID}`);
    expect(logged.at(-1)).toBe("Control9 summary JSON: /tmp/control9-summary.json");
  });

  it("falls back to baseline structured logs when section markers are disabled", () => {
    const rendered = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        decisionId: "dec-deny",
        decisionKind: "deny",
        reason: "Policy restriction triggered.",
      },
      runtimeMode: "enforce",
    });
    const log = vi.fn();

    const result = publishGitLabJobFeedback(
      { rendered, summaryPath: "/tmp/control9-summary.json" },
      {
        log,
        canWriteSections: () => false,
      },
    );

    expect(result).toEqual({ sectionWritten: false, usedLogFallback: true });
    const logged = log.mock.calls.map(([line]) => String(line));
    expect(logged[0]).toMatch(/^Control9 WARNING:/);
    expect(logged).toContain(SUMMARY_SECTION_HEADING);
    expect(logged).toContain(rendered.title);
    expect(logged.at(-1)).toBe("Control9 summary JSON: /tmp/control9-summary.json");
    expect(logged.some((line) => line.includes("section_start"))).toBe(false);
  });

  it("respects CONTROL9_DISABLE_JOB_LOG_SECTIONS for baseline log fallback", () => {
    const previous = process.env[DISABLE_SECTION_MARKERS_ENV];
    process.env[DISABLE_SECTION_MARKERS_ENV] = "true";

    try {
      const rendered = renderDecisionFeedback({
        kind: "policy_decision",
        decision: {
          decisionId: "dec-allow",
          decisionKind: "allow",
          reason: "Allowed.",
        },
      });
      const log = vi.fn();

      const result = publishGitLabJobFeedback(
        { rendered, summaryPath: "/tmp/control9-summary.json" },
        { log },
      );

      expect(result).toEqual({ sectionWritten: false, usedLogFallback: true });
      expect(log.mock.calls.map(([line]) => String(line)).some((line) => line.includes("section_start"))).toBe(
        false,
      );
    } finally {
      process.env[DISABLE_SECTION_MARKERS_ENV] = previous;
    }
  });

  it("uses deploy verification headings and section ids when requested", () => {
    const rendered = renderDecisionFeedback({
      kind: "verified",
      verificationId: "verify-001",
    });
    const log = vi.fn();

    publishGitLabJobFeedback(
      { rendered, presentation: "deploy-verification" },
      {
        log,
        canWriteSections: () => true,
        nowSeconds: () => 42,
      },
    );

    const logged = log.mock.calls.map(([line]) => String(line)).join("\n");
    expect(logged).toContain(DEPLOY_VERIFICATION_SECTION_HEADING);
    expect(logged).toContain(`section_start:42:${DEPLOY_VERIFICATION_SECTION_ID}`);
  });
});

describe("publishGitLabPresentationFeedback", () => {
  it("orchestrates job log feedback before MR note publishing", async () => {
    const rendered = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        decisionId: "dec-allow",
        decisionKind: "allow",
        reason: "Allowed.",
      },
    });
    const log = vi.fn();
    const publishMrNoteSpy = vi
      .spyOn(mrNoteModule, "publishMrNote")
      .mockImplementation(async () => {
        expect(log).toHaveBeenCalled();
        return { state: "skipped-no-mr" };
      });

    try {
      const result = await publishGitLabPresentationFeedback(
        { rendered, summaryPath: "/tmp/control9-summary.json" },
        {
          log,
          canWriteSections: () => true,
          nowSeconds: () => 1,
        },
      );

      expect(result.sectionWritten).toBe(true);
      expect(result.mrNoteState).toBe("skipped-no-mr");
      expect(publishMrNoteSpy).toHaveBeenCalledOnce();
    } finally {
      publishMrNoteSpy.mockRestore();
    }
  });
});

describe("buildLogFallbackLines", () => {
  it("includes the policy section heading and decision detail lines", () => {
    const rendered = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        decisionId: "dec-observe-log",
        decisionKind: "observe",
        reason: "Advisory finding.",
      },
    });

    const lines = buildLogFallbackLines(rendered);

    expect(lines[0]).toBe(`## ${SUMMARY_SECTION_HEADING}`);
    expect(lines).toContain(rendered.label);
    expect(lines.some((line) => line.startsWith("- Decision kind:"))).toBe(true);
  });
});

describe("writeGitLabPresentationOutputs", () => {
  let previousGitLabEnv: string | undefined;

  beforeEach(() => {
    previousGitLabEnv = process.env.GITLAB_ENV;
  });

  afterEach(() => {
    process.env.GITLAB_ENV = previousGitLabEnv;
  });

  it("writes presentation state to GITLAB_ENV when configured", () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "control9-gitlab-env-"));
    const envPath = path.join(tempDirectory, "gitlab.env");
    process.env.GITLAB_ENV = envPath;

    writeGitLabPresentationOutputs({
      sectionWritten: true,
      usedLogFallback: false,
      mrNoteState: "skipped-no-mr",
    });

    const contents = readFileSync(envPath, "utf8");
    expect(contents).toContain("CONTROL9_JOB_SECTION_WRITTEN=true");
    expect(contents).toContain("CONTROL9_USED_LOG_FALLBACK=false");
    expect(contents).toContain("CONTROL9_MR_NOTE_STATE=skipped-no-mr");
  });
});
