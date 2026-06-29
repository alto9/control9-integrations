import { describe, expect, it } from "vitest";

import type { PolicyDecision, RedactionReport } from "../src/envelope/types";
import { renderDecisionFeedback } from "../src/rendering/decision-renderer";
import { OUTCOME_TEMPLATES } from "../src/rendering/templates";

const baseDecision: PolicyDecision = {
  decisionId: "dec-observe-1",
  decisionKind: "observe",
  reason: "Public S3 bucket change detected.",
  riskSummary: "Bucket policy may expose objects publicly.",
  policyVersion: "2026.06.1",
  followUp: { action: "Review bucket policy before deploy." },
};

const redactionReport: RedactionReport = {
  profile: "default",
  totalRedactions: 2,
  markers: [
    { marker: "[REDACTED:secret]", valueClass: "secret", count: 1 },
    { marker: "[REDACTED:token]", valueClass: "token", count: 1 },
  ],
};

const UNSAFE_PATTERNS = [
  /BEGIN RSA PRIVATE KEY/,
  /ghp_[A-Za-z0-9]+/,
  /AKIA[0-9A-Z]{16}/,
  /super-secret-token-value/,
  /process\.env/,
  /"Resources":/,
];

function expectSafeRenderedContent(content: string): void {
  for (const pattern of UNSAFE_PATTERNS) {
    expect(content).not.toMatch(pattern);
  }
}

describe("renderDecisionFeedback", () => {
  it.each([
    "allow",
    "deny",
    "require_approval",
    "observe",
  ] as const)("renders policy decision templates for %s", (decisionKind) => {
    const rendered = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        ...baseDecision,
        decisionId: `dec-${decisionKind}`,
        decisionKind,
        reason: `${decisionKind} reason text.`,
      },
      artifactFingerprint: "fp-abc123",
      targetEnvironment: "production",
      redactionReport,
      runtimeMode: "shadow",
    });

    expect(rendered.outcomeKind).toBe(decisionKind);
    expect(rendered.label).toBe(OUTCOME_TEMPLATES[decisionKind].label);
    expect(rendered.detailLines.join("\n")).toContain("Decision id: dec-");
    expect(rendered.detailLines.join("\n")).toContain("Artifact fingerprint: fp-abc123");
    expect(rendered.detailLines.join("\n")).toContain("Target environment: production");
    expect(rendered.detailLines.join("\n")).toContain("Policy version: 2026.06.1");
    expect(rendered.detailLines.join("\n")).toContain("Risk summary:");
    expect(rendered.detailLines.join("\n")).toContain("Redaction status:");
    expect(rendered.metadata.decisionId).toBe(`dec-${decisionKind}`);
    expectSafeRenderedContent(rendered.bodyMarkdown);
  });

  it("uses distinct text labels for every outcome kind", () => {
    const labels = new Set<string>();

    const policyKinds = ["allow", "deny", "require_approval", "observe"] as const;
    for (const decisionKind of policyKinds) {
      const rendered = renderDecisionFeedback({
        kind: "policy_decision",
        decision: { ...baseDecision, decisionKind, reason: "reason" },
      });
      labels.add(rendered.label);
    }

    for (const kind of ["timeout", "unavailable_api", "redaction_applied", "fingerprint_mismatch"] as const) {
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
      labels.add(rendered.label);
    }

    expect(labels.size).toBe(8);
  });

  it("marks observe decisions as advisory and non-blocking", () => {
    const rendered = renderDecisionFeedback({
      kind: "policy_decision",
      decision: baseDecision,
      runtimeMode: "shadow",
    });

    expect(rendered.isAdvisory).toBe(true);
    expect(rendered.blocksWorkflow).toBe(false);
    expect(rendered.summary).toMatch(/advisory finding/i);
    expect(rendered.summary).toMatch(/not blocked/i);
  });

  it("does not imply blocking for deny or require_approval in shadow mode", () => {
    const denyRendered = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        ...baseDecision,
        decisionKind: "deny",
        reason: "Policy restriction triggered.",
      },
      runtimeMode: "shadow",
    });

    expect(denyRendered.blocksWorkflow).toBe(false);
    expect(denyRendered.summary).toMatch(/Shadow mode is active/i);
    expect(denyRendered.summary).toMatch(/not blocked by Control9/i);

    const approvalRendered = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        ...baseDecision,
        decisionKind: "require_approval",
        reason: "Policy restriction triggered.",
      },
      runtimeMode: "shadow",
    });

    expect(approvalRendered.blocksWorkflow).toBe(false);
    expect(approvalRendered.summary).toMatch(/Shadow mode is active/i);
    expect(approvalRendered.summary).toMatch(/not waiting for approval/i);
  });

  it("allows optional metadata to be omitted cleanly", () => {
    const rendered = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        decisionId: "dec-minimal",
        decisionKind: "allow",
        reason: "Allowed.",
      },
    });

    expect(rendered.detailLines.join("\n")).not.toContain("Risk summary:");
    expect(rendered.detailLines.join("\n")).not.toContain("Policy version:");
    expect(rendered.detailLines.join("\n")).not.toContain("Target environment:");
    expect(rendered.detailLines.join("\n")).not.toContain("Artifact fingerprint:");
    expect(rendered.detailLines.join("\n")).not.toContain("Redaction status:");
    expect(rendered.metadata.policyVersion).toBeUndefined();
    expect(rendered.metadata.redactionStatus).toBeUndefined();
  });

  it("renders timeout, unavailable API, redaction applied, and fingerprint mismatch outcomes", () => {
    const timeout = renderDecisionFeedback({
      kind: "timeout",
      artifactFingerprint: "fp-timeout",
      targetEnvironment: "staging",
    });
    expect(timeout.outcomeKind).toBe("timeout");
    expect(timeout.label).toBe(OUTCOME_TEMPLATES.timeout.label);
    expect(timeout.detailLines.join("\n")).toContain("Artifact fingerprint: fp-timeout");

    const unavailable = renderDecisionFeedback({ kind: "unavailable_api" });
    expect(unavailable.outcomeKind).toBe("unavailable_api");
    expect(unavailable.summary).toMatch(/could not reach the policy API/i);

    const redaction = renderDecisionFeedback({
      kind: "redaction_applied",
      redactionReport,
      targetEnvironment: "production",
    });
    expect(redaction.outcomeKind).toBe("redaction_applied");
    expect(redaction.metadata.redactionStatus).toMatch(/2 value\(s\) redacted/);

    const mismatch = renderDecisionFeedback({
      kind: "fingerprint_mismatch",
      expectedFingerprint: "fp-approved",
      actualFingerprint: "fp-current",
    });
    expect(mismatch.outcomeKind).toBe("fingerprint_mismatch");
    expect(mismatch.blocksWorkflow).toBe(true);
    expect(mismatch.detailLines.join("\n")).toContain("Expected fingerprint: fp-approved");
    expect(mismatch.detailLines.join("\n")).toContain("Actual fingerprint: fp-current");
  });

  it("exposes structured metadata for downstream workflow and PR renderers", () => {
    const rendered = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        ...baseDecision,
        followUp: { approval_url: "https://control9.example/approve/dec-observe-1" },
      },
      artifactFingerprint: "fp-abc123",
      targetEnvironment: "production",
      redactionReport,
      runtimeMode: "shadow",
    });

    expect(rendered.metadata).toEqual({
      decisionId: "dec-observe-1",
      policyVersion: "2026.06.1",
      artifactFingerprint: "fp-abc123",
      targetEnvironment: "production",
      redactionStatus: "2 value(s) redacted (profile: default; secret: 1, token: 1)",
      followUpAction: "Approval required at https://control9.example/approve/dec-observe-1",
    });
    expect(rendered.bodyMarkdown).toContain("## Control9 advisory finding");
    expect(rendered.annotationMessage.startsWith("Decision: Observe (Advisory)")).toBe(true);
  });

  it("never includes raw secrets or envelope payloads in rendered output", () => {
    const rendered = renderDecisionFeedback({
      kind: "policy_decision",
      decision: {
        decisionId: "dec-unsafe",
        decisionKind: "deny",
        reason: "Sensitive resource change detected.",
        followUp: {
          leaked_secret: "super-secret-token-value",
          private_key: "-----BEGIN RSA PRIVATE KEY-----",
          envelope: { Resources: { Bucket: { Type: "AWS::S3::Bucket" } } },
        },
      },
      runtimeMode: "shadow",
    });

    expectSafeRenderedContent(rendered.bodyMarkdown);
    expectSafeRenderedContent(rendered.summary);
    expectSafeRenderedContent(rendered.detailLines.join("\n"));
    expect(rendered.metadata.followUpAction).toBeUndefined();
  });
});
