import { describe, expect, it, vi } from "vitest";

import type { PolicyDecision, RedactionReport } from "../src/envelope/types";
import { DEPLOY_VERIFICATION_SECTION_HEADING } from "../src/github/workflow-summary";
import {
  CONTROL9_MR_MARKER_PREFIX,
  GitLabApiError,
  buildMrNoteBody,
  buildMrNoteMarker,
  publishMrNote,
  readMrNoteContextFromEnv,
} from "../src/gitlab/mr-note";
import { renderDecisionFeedback } from "../src/rendering/decision-renderer";

const redactionReport: RedactionReport = {
  profile: "default",
  totalRedactions: 1,
  markers: [{ marker: "[REDACTED:secret]", valueClass: "secret", count: 1 }],
};

function renderPolicyDecision(decision: PolicyDecision) {
  return renderDecisionFeedback({
    kind: "policy_decision",
    decision,
    artifactFingerprint: "fp-test-001",
    targetEnvironment: "production",
    redactionReport,
    runtimeMode: "shadow",
  });
}

function mockMrContext() {
  return {
    apiBaseUrl: "https://gitlab.example.com/api/v4",
    token: "glpat-test-token",
    projectId: "42",
    mergeRequestIid: 7,
    pipelineId: "100",
    jobName: "control9",
  };
}

describe("buildMrNoteMarker", () => {
  it("builds a stable hidden marker for pipeline and job", () => {
    const marker = buildMrNoteMarker({ pipelineId: "100", jobName: "control9" });
    expect(marker).toBe(
      `<!-- ${CONTROL9_MR_MARKER_PREFIX}:pipeline=100:job=control9 -->`,
    );
  });
});

describe("buildMrNoteBody", () => {
  it("includes the hidden marker and safe rendered decision content", () => {
    const rendered = renderPolicyDecision({
      decisionId: "dec-observe-1",
      decisionKind: "observe",
      reason: "Advisory finding.",
      policyVersion: "2026.06.1",
    });
    const marker = buildMrNoteMarker({ pipelineId: "100", jobName: "control9" });
    const body = buildMrNoteBody(rendered, marker);

    expect(body.startsWith(marker)).toBe(true);
    expect(body).toContain("Control9 advisory finding");
    expect(body).toContain("Decision id: dec-observe-1");
    expect(body).toContain("Policy version: 2026.06.1");
    expect(body).not.toMatch(/BEGIN RSA PRIVATE KEY/);
    expect(body).not.toContain("secret-value");
  });

  it("uses deploy verification headings when requested", () => {
    const rendered = renderDecisionFeedback({
      kind: "verified",
      verificationId: "verify-001",
    });
    const marker = buildMrNoteMarker({ pipelineId: "100", jobName: "control9" });
    const body = buildMrNoteBody(rendered, marker, "deploy-verification");

    expect(body).toContain(`## ${DEPLOY_VERIFICATION_SECTION_HEADING}`);
  });
});

describe("readMrNoteContextFromEnv", () => {
  it("reads merge request context from GitLab CI variables", () => {
    const previous = {
      CI_MERGE_REQUEST_IID: process.env.CI_MERGE_REQUEST_IID,
      CI_PROJECT_ID: process.env.CI_PROJECT_ID,
      CI_SERVER_URL: process.env.CI_SERVER_URL,
      CONTROL9_GITLAB_TOKEN: process.env.CONTROL9_GITLAB_TOKEN,
      GITLAB_TOKEN: process.env.GITLAB_TOKEN,
      CI_JOB_TOKEN: process.env.CI_JOB_TOKEN,
      CI_PIPELINE_ID: process.env.CI_PIPELINE_ID,
      CI_JOB_NAME: process.env.CI_JOB_NAME,
    };

    try {
      process.env.CI_MERGE_REQUEST_IID = "7";
      process.env.CI_PROJECT_ID = "42";
      process.env.CI_SERVER_URL = "https://gitlab.example.com";
      process.env.CONTROL9_GITLAB_TOKEN = "glpat-preferred";
      delete process.env.GITLAB_TOKEN;
      delete process.env.CI_JOB_TOKEN;
      process.env.CI_PIPELINE_ID = "100";
      process.env.CI_JOB_NAME = "control9";

      const context = readMrNoteContextFromEnv();
      expect(context?.mergeRequestIid).toBe(7);
      expect(context?.projectId).toBe("42");
      expect(context?.token).toBe("glpat-preferred");
      expect(context?.apiBaseUrl).toBe("https://gitlab.example.com/api/v4");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("prefers CONTROL9_GITLAB_TOKEN over GITLAB_TOKEN and CI_JOB_TOKEN", () => {
    const previous = {
      CI_MERGE_REQUEST_IID: process.env.CI_MERGE_REQUEST_IID,
      CI_PROJECT_ID: process.env.CI_PROJECT_ID,
      CI_SERVER_URL: process.env.CI_SERVER_URL,
      CONTROL9_GITLAB_TOKEN: process.env.CONTROL9_GITLAB_TOKEN,
      GITLAB_TOKEN: process.env.GITLAB_TOKEN,
      CI_JOB_TOKEN: process.env.CI_JOB_TOKEN,
    };

    try {
      process.env.CI_MERGE_REQUEST_IID = "3";
      process.env.CI_PROJECT_ID = "99";
      process.env.CI_SERVER_URL = "https://gitlab.example.com";
      process.env.CONTROL9_GITLAB_TOKEN = "preferred";
      process.env.GITLAB_TOKEN = "fallback";
      process.env.CI_JOB_TOKEN = "job-token";

      expect(readMrNoteContextFromEnv()?.token).toBe("preferred");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("returns undefined when CI_MERGE_REQUEST_IID is absent", () => {
    const previous = process.env.CI_MERGE_REQUEST_IID;
    delete process.env.CI_MERGE_REQUEST_IID;

    try {
      expect(readMrNoteContextFromEnv()).toBeUndefined();
    } finally {
      process.env.CI_MERGE_REQUEST_IID = previous;
    }
  });
});

describe("publishMrNote", () => {
  it("creates a new note when no Control9 marker exists", async () => {
    const rendered = renderPolicyDecision({
      decisionId: "dec-allow-1",
      decisionKind: "allow",
      reason: "Allowed.",
    });
    const context = mockMrContext();
    const marker = buildMrNoteMarker(context);
    const createMergeRequestNote = vi.fn().mockResolvedValue({ id: 9001, body: "created" });
    const listMergeRequestNotes = vi.fn().mockResolvedValue([]);

    const result = await publishMrNote(
      { rendered },
      {
        readContext: () => context,
        client: {
          listMergeRequestNotes,
          createMergeRequestNote,
          updateMergeRequestNote: vi.fn(),
        },
        warning: vi.fn(),
      },
    );

    expect(result.state).toBe("created");
    expect(result.noteId).toBe(9001);
    expect(createMergeRequestNote).toHaveBeenCalledWith(
      "42",
      7,
      expect.stringContaining(marker),
    );
  });

  it("updates the existing Control9 note when the marker matches", async () => {
    const rendered = renderPolicyDecision({
      decisionId: "dec-observe-2",
      decisionKind: "observe",
      reason: "Updated advisory.",
    });
    const context = mockMrContext();
    const marker = buildMrNoteMarker(context);
    const existingBody = `${marker}\n\nOld content`;
    const updateMergeRequestNote = vi.fn().mockResolvedValue({ id: 8001, body: "updated" });
    const createMergeRequestNote = vi.fn();

    const result = await publishMrNote(
      { rendered },
      {
        readContext: () => context,
        client: {
          listMergeRequestNotes: vi.fn().mockResolvedValue([{ id: 8001, body: existingBody }]),
          createMergeRequestNote,
          updateMergeRequestNote,
        },
        warning: vi.fn(),
      },
    );

    expect(result.state).toBe("updated");
    expect(result.noteId).toBe(8001);
    expect(updateMergeRequestNote).toHaveBeenCalledWith(
      "42",
      7,
      8001,
      expect.stringContaining(marker),
    );
    expect(createMergeRequestNote).not.toHaveBeenCalled();
  });

  it("skips when CI_MERGE_REQUEST_IID is absent", async () => {
    const previous = process.env.CI_MERGE_REQUEST_IID;
    delete process.env.CI_MERGE_REQUEST_IID;

    try {
      const result = await publishMrNote(
        { rendered: renderPolicyDecision({
          decisionId: "dec-observe-3",
          decisionKind: "observe",
          reason: "Advisory.",
        }) },
        { warning: vi.fn() },
      );

      expect(result.state).toBe("skipped-no-mr");
    } finally {
      process.env.CI_MERGE_REQUEST_IID = previous;
    }
  });

  it("skips when no GitLab token is available on a merge request pipeline", async () => {
    const previous = {
      CI_MERGE_REQUEST_IID: process.env.CI_MERGE_REQUEST_IID,
      CI_PROJECT_ID: process.env.CI_PROJECT_ID,
      CI_SERVER_URL: process.env.CI_SERVER_URL,
      CONTROL9_GITLAB_TOKEN: process.env.CONTROL9_GITLAB_TOKEN,
      GITLAB_TOKEN: process.env.GITLAB_TOKEN,
      CI_JOB_TOKEN: process.env.CI_JOB_TOKEN,
    };

    try {
      process.env.CI_MERGE_REQUEST_IID = "7";
      process.env.CI_PROJECT_ID = "42";
      process.env.CI_SERVER_URL = "https://gitlab.example.com";
      delete process.env.CONTROL9_GITLAB_TOKEN;
      delete process.env.GITLAB_TOKEN;
      delete process.env.CI_JOB_TOKEN;

      const result = await publishMrNote(
        { rendered: renderPolicyDecision({
          decisionId: "dec-observe-4",
          decisionKind: "observe",
          reason: "Advisory.",
        }) },
        { warning: vi.fn() },
      );

      expect(result.state).toBe("skipped-no-token");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("skips with skipped-permission for read-only token behavior", async () => {
    const context = mockMrContext();
    const warning = vi.fn();

    const result = await publishMrNote(
      { rendered: renderPolicyDecision({
        decisionId: "dec-observe-5",
        decisionKind: "observe",
        reason: "Advisory.",
      }) },
      {
        readContext: () => context,
        client: {
          listMergeRequestNotes: vi.fn().mockRejectedValue(new GitLabApiError(403, "forbidden")),
          createMergeRequestNote: vi.fn(),
          updateMergeRequestNote: vi.fn(),
        },
        warning,
      },
    );

    expect(result.state).toBe("skipped-permission");
    expect(warning).toHaveBeenCalledWith(
      "Control9 skipped merge request note: insufficient GitLab token permissions.",
    );
  });

  it("returns failed-fallback without blocking observe decisions", async () => {
    const context = mockMrContext();
    const warning = vi.fn();

    const result = await publishMrNote(
      { rendered: renderPolicyDecision({
        decisionId: "dec-observe-6",
        decisionKind: "observe",
        reason: "Advisory.",
      }) },
      {
        readContext: () => context,
        client: {
          listMergeRequestNotes: vi.fn().mockRejectedValue(new Error("network down")),
          createMergeRequestNote: vi.fn(),
          updateMergeRequestNote: vi.fn(),
        },
        warning,
      },
    );

    expect(result.state).toBe("failed-fallback");
    expect(warning).toHaveBeenCalled();
  });

  it("does not create duplicate visible notes when reruns share pipeline context", async () => {
    const context = mockMrContext();
    const marker = buildMrNoteMarker(context);
    const rendered = renderPolicyDecision({
      decisionId: "dec-observe-rerun",
      decisionKind: "observe",
      reason: "Rerun advisory.",
    });
    const createMergeRequestNote = vi.fn();
    const updateMergeRequestNote = vi.fn().mockResolvedValue({ id: 7001, body: "updated" });

    await publishMrNote(
      { rendered },
      {
        readContext: () => context,
        client: {
          listMergeRequestNotes: vi
            .fn()
            .mockResolvedValue([{ id: 7001, body: `${marker}\n\nFirst run` }]),
          createMergeRequestNote,
          updateMergeRequestNote,
        },
        warning: vi.fn(),
      },
    );

    expect(createMergeRequestNote).not.toHaveBeenCalled();
    expect(updateMergeRequestNote).toHaveBeenCalledOnce();
  });
});
