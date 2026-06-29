import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PolicyDecision, RedactionReport } from "../src/envelope/types";
import {
  SUMMARY_SECTION_HEADING,
  appendWorkflowSummary,
  buildLogFallbackLines,
  buildWorkflowSummarySection,
  emitDecisionAnnotation,
  publishWorkflowFeedback,
} from "../src/github/workflow-summary";
import { renderDecisionFeedback } from "../src/rendering/decision-renderer";

const redactionReport: RedactionReport = {
  profile: "default",
  totalRedactions: 1,
  markers: [{ marker: "[REDACTED:secret]", valueClass: "secret", count: 1 }],
};

function renderPolicyDecision(
  decision: PolicyDecision,
  runtimeMode: "shadow" | "enforce" = "shadow",
) {
  return renderDecisionFeedback({
    kind: "policy_decision",
    decision,
    artifactFingerprint: "fp-test-001",
    targetEnvironment: "production",
    redactionReport,
    runtimeMode,
  });
}

describe("buildWorkflowSummarySection", () => {
  it("includes the stable Control9 Policy Decision heading", () => {
    const rendered = renderPolicyDecision({
      decisionId: "dec-allow-1",
      decisionKind: "allow",
      reason: "Allowed.",
    });

    const markdown = buildWorkflowSummarySection(rendered);

    expect(markdown.startsWith(`## ${SUMMARY_SECTION_HEADING}`)).toBe(true);
    expect(markdown).toContain("Control9 allowed this change");
    expect(markdown).toContain("Decision id: dec-allow-1");
  });
});

describe("appendWorkflowSummary", () => {
  it("writes markdown to GITHUB_STEP_SUMMARY when the path is writable", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "control9-summary-"));
    const summaryPath = path.join(tempDirectory, "summary.md");
    writeFileSync(summaryPath, "", "utf8");
    const previous = process.env.GITHUB_STEP_SUMMARY;

    try {
      process.env.GITHUB_STEP_SUMMARY = summaryPath;
      const written = await appendWorkflowSummary("## Control9 Policy Decision\n\nAllowed.");
      expect(written).toBe(true);
      expect(readFileSync(summaryPath, "utf8")).toContain("Control9 Policy Decision");
    } finally {
      process.env.GITHUB_STEP_SUMMARY = previous;
    }
  });

  it("returns false when GITHUB_STEP_SUMMARY is unset", async () => {
    const previous = process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GITHUB_STEP_SUMMARY;

    try {
      await expect(appendWorkflowSummary("test")).resolves.toBe(false);
    } finally {
      process.env.GITHUB_STEP_SUMMARY = previous;
    }
  });
});

describe("emitDecisionAnnotation", () => {
  it("uses notice for advisory observe decisions", () => {
    const rendered = renderPolicyDecision({
      decisionId: "dec-observe-1",
      decisionKind: "observe",
      reason: "Advisory finding.",
    });
    const notice = vi.fn();
    const warning = vi.fn();

    emitDecisionAnnotation(rendered, { notice, warning });

    expect(notice).toHaveBeenCalledWith(rendered.annotationMessage, {
      title: rendered.label,
    });
    expect(warning).not.toHaveBeenCalled();
  });

  it("uses warning for blocking outcomes", () => {
    const rendered = renderDecisionFeedback({
      kind: "fingerprint_mismatch",
      expectedFingerprint: "fp-approved",
      actualFingerprint: "fp-current",
    });
    const notice = vi.fn();
    const warning = vi.fn();

    emitDecisionAnnotation(rendered, { notice, warning });

    expect(warning).toHaveBeenCalledWith(rendered.annotationMessage, {
      title: rendered.label,
    });
    expect(notice).not.toHaveBeenCalled();
  });
});

describe("publishWorkflowFeedback", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_EVENT_NAME", "");
    vi.stubEnv("GITHUB_EVENT_PATH", "");
    vi.stubEnv("GITHUB_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "allow",
    "deny",
    "require_approval",
    "observe",
  ] as const)("publishes workflow summary content for %s decisions", async (decisionKind) => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "control9-summary-"));
    const summaryPath = path.join(tempDirectory, "summary.md");
    writeFileSync(summaryPath, "", "utf8");
    const previous = process.env.GITHUB_STEP_SUMMARY;

    try {
      process.env.GITHUB_STEP_SUMMARY = summaryPath;
      const rendered = renderPolicyDecision({
        decisionId: `dec-${decisionKind}`,
        decisionKind,
        reason: `${decisionKind} reason.`,
        riskSummary: "Risk details.",
        policyVersion: "2026.06.1",
      });

      const result = await publishWorkflowFeedback({
        rendered,
        summaryPath: "/tmp/control9-summary.json",
      });

      expect(result.summaryWritten).toBe(true);
      expect(result.usedLogFallback).toBe(false);
      expect(result.prCommentState).toBe("skipped-no-pr");
      const written = readFileSync(summaryPath, "utf8");
      expect(written).toContain(SUMMARY_SECTION_HEADING);
      expect(written).toContain(`Decision kind: ${decisionKind}`);
      expect(written).toContain("Risk summary:");
      expect(written).toContain("Policy version: 2026.06.1");
      expect(written).toContain("Artifact fingerprint: fp-test-001");
      expect(written).toContain("Redaction status:");
    } finally {
      process.env.GITHUB_STEP_SUMMARY = previous;
    }
  });

  it("does not mark observe shadow-mode decisions as blocking", async () => {
    const rendered = renderPolicyDecision({
      decisionId: "dec-observe-shadow",
      decisionKind: "observe",
      reason: "Public bucket change detected.",
    });

    expect(rendered.blocksWorkflow).toBe(false);
    expect(rendered.isAdvisory).toBe(true);
  });

  it("falls back to safe job logs when GITHUB_STEP_SUMMARY is unavailable", async () => {
    const previous = process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GITHUB_STEP_SUMMARY;

    const rendered = renderPolicyDecision({
      decisionId: "dec-observe-fallback",
      decisionKind: "observe",
      reason: "Advisory finding.",
    });
    const info = vi.fn();

    try {
      const result = await publishWorkflowFeedback(
        { rendered, summaryPath: "/tmp/control9-summary.json" },
        { info },
      );

      expect(result.summaryWritten).toBe(false);
      expect(result.usedLogFallback).toBe(true);
      expect(info).toHaveBeenCalled();
      const logged = info.mock.calls.map(([line]) => String(line)).join("\n");
      expect(logged).toContain(SUMMARY_SECTION_HEADING);
      expect(logged).toContain("Decision: Observe (Advisory)");
      expect(logged).toContain("Local summary JSON: /tmp/control9-summary.json");
      expect(logged).not.toMatch(/BEGIN RSA PRIVATE KEY/);
    } finally {
      process.env.GITHUB_STEP_SUMMARY = previous;
    }
  });

  it("renders timeout, unavailable API, redaction applied, and fingerprint mismatch paths", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "control9-summary-"));
    const summaryPath = path.join(tempDirectory, "summary.md");
    writeFileSync(summaryPath, "", "utf8");
    const previous = process.env.GITHUB_STEP_SUMMARY;

    try {
      process.env.GITHUB_STEP_SUMMARY = summaryPath;

      for (const kind of [
        "timeout",
        "unavailable_api",
        "redaction_applied",
        "fingerprint_mismatch",
      ] as const) {
        writeFileSync(summaryPath, "", "utf8");
        const rendered =
          kind === "redaction_applied"
            ? renderDecisionFeedback({ kind, redactionReport })
            : kind === "fingerprint_mismatch"
              ? renderDecisionFeedback({
                  kind,
                  expectedFingerprint: "fp-approved",
                  actualFingerprint: "fp-current",
                })
              : renderDecisionFeedback({ kind });

        const result = await publishWorkflowFeedback({ rendered });
        expect(result.summaryWritten).toBe(true);
        expect(readFileSync(summaryPath, "utf8")).toContain(SUMMARY_SECTION_HEADING);
      }
    } finally {
      process.env.GITHUB_STEP_SUMMARY = previous;
    }
  });
});

describe("buildLogFallbackLines", () => {
  it("includes concise decision labels and detail lines", () => {
    const rendered = renderPolicyDecision({
      decisionId: "dec-observe-log",
      decisionKind: "observe",
      reason: "Advisory finding.",
    });

    const lines = buildLogFallbackLines(rendered);

    expect(lines[0]).toBe(`## ${SUMMARY_SECTION_HEADING}`);
    expect(lines).toContain(rendered.label);
    expect(lines.some((line) => line.startsWith("- Decision kind:"))).toBe(true);
  });
});
