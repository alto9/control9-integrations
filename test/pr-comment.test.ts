import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { PolicyDecision, RedactionReport } from "../src/envelope/types";
import {
  CONTROL9_COMMENT_MARKER_PREFIX,
  GitHubApiError,
  buildCommentMarker,
  buildPrCommentBody,
  publishPrComment,
  readPrCommentContextFromEnv,
} from "../src/github/pr-comment";
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

function mockPrContext() {
  return {
    apiUrl: "https://api.github.com",
    token: "ghs_test_token",
    owner: "acme",
    repo: "infra",
    pullRequestNumber: 42,
    workflow: "control9",
    job: "evaluate",
    eventName: "pull_request",
  };
}

describe("buildCommentMarker", () => {
  it("builds a stable hidden marker for workflow and job", () => {
    const marker = buildCommentMarker({ workflow: "control9", job: "evaluate" });
    expect(marker).toBe(
      `<!-- ${CONTROL9_COMMENT_MARKER_PREFIX}:workflow=control9:job=evaluate -->`,
    );
  });
});

describe("buildPrCommentBody", () => {
  it("includes the hidden marker and safe rendered decision content", () => {
    const rendered = renderPolicyDecision({
      decisionId: "dec-observe-1",
      decisionKind: "observe",
      reason: "Advisory finding.",
      policyVersion: "2026.06.1",
    });
    const marker = buildCommentMarker({ workflow: "control9", job: "evaluate" });
    const body = buildPrCommentBody(rendered, marker);

    expect(body.startsWith(marker)).toBe(true);
    expect(body).toContain("Control9 advisory finding");
    expect(body).toContain("Decision id: dec-observe-1");
    expect(body).toContain("Policy version: 2026.06.1");
    expect(body).not.toMatch(/BEGIN RSA PRIVATE KEY/);
    expect(body).not.toContain("secret-value");
  });
});

describe("readPrCommentContextFromEnv", () => {
  it("reads pull request context from a pull_request event payload", () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "control9-event-"));
    const eventPath = path.join(tempDirectory, "event.json");
    writeFileSync(
      eventPath,
      JSON.stringify({ pull_request: { number: 17 } }),
      "utf8",
    );

    const previous = {
      GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
      GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
      GITHUB_API_URL: process.env.GITHUB_API_URL,
      GITHUB_WORKFLOW: process.env.GITHUB_WORKFLOW,
      GITHUB_JOB: process.env.GITHUB_JOB,
    };

    try {
      process.env.GITHUB_EVENT_NAME = "pull_request";
      process.env.GITHUB_EVENT_PATH = eventPath;
      process.env.GITHUB_TOKEN = "ghs_test_token";
      process.env.GITHUB_REPOSITORY = "acme/infra";
      process.env.GITHUB_API_URL = "https://api.github.com";
      process.env.GITHUB_WORKFLOW = "control9";
      process.env.GITHUB_JOB = "evaluate";

      const context = readPrCommentContextFromEnv();
      expect(context?.pullRequestNumber).toBe(17);
      expect(context?.owner).toBe("acme");
      expect(context?.repo).toBe("infra");
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

  it("returns undefined for non-pull-request events", () => {
    const previous = process.env.GITHUB_EVENT_NAME;
    process.env.GITHUB_EVENT_NAME = "push";

    try {
      expect(readPrCommentContextFromEnv()).toBeUndefined();
    } finally {
      process.env.GITHUB_EVENT_NAME = previous;
    }
  });
});

describe("publishPrComment", () => {
  it("creates a new comment when no Control9 marker exists", async () => {
    const rendered = renderPolicyDecision({
      decisionId: "dec-allow-1",
      decisionKind: "allow",
      reason: "Allowed.",
    });
    const context = mockPrContext();
    const marker = buildCommentMarker(context);
    const createIssueComment = vi.fn().mockResolvedValue({ id: 9001, body: "created" });
    const listIssueComments = vi.fn().mockResolvedValue([]);

    const result = await publishPrComment(
      { rendered },
      {
        readContext: () => context,
        client: {
          listIssueComments,
          createIssueComment,
          updateIssueComment: vi.fn(),
        },
        warning: vi.fn(),
      },
    );

    expect(result.state).toBe("created");
    expect(result.commentId).toBe(9001);
    expect(createIssueComment).toHaveBeenCalledWith(
      "acme",
      "infra",
      42,
      expect.stringContaining(marker),
    );
  });

  it("updates the existing Control9 comment when the marker matches", async () => {
    const rendered = renderPolicyDecision({
      decisionId: "dec-observe-2",
      decisionKind: "observe",
      reason: "Updated advisory.",
    });
    const context = mockPrContext();
    const marker = buildCommentMarker(context);
    const existingBody = `${marker}\n\nOld content`;
    const updateIssueComment = vi.fn().mockResolvedValue({ id: 8001, body: "updated" });
    const createIssueComment = vi.fn();

    const result = await publishPrComment(
      { rendered },
      {
        readContext: () => context,
        client: {
          listIssueComments: vi.fn().mockResolvedValue([{ id: 8001, body: existingBody }]),
          createIssueComment,
          updateIssueComment,
        },
        warning: vi.fn(),
      },
    );

    expect(result.state).toBe("updated");
    expect(result.commentId).toBe(8001);
    expect(updateIssueComment).toHaveBeenCalledWith(
      "acme",
      "infra",
      8001,
      expect.stringContaining(marker),
    );
    expect(createIssueComment).not.toHaveBeenCalled();
  });

  it("skips when the event is not a pull request", async () => {
    const previous = process.env.GITHUB_EVENT_NAME;
    process.env.GITHUB_EVENT_NAME = "push";

    try {
      const result = await publishPrComment(
        { rendered: renderPolicyDecision({
          decisionId: "dec-observe-3",
          decisionKind: "observe",
          reason: "Advisory.",
        }) },
        { warning: vi.fn() },
      );

      expect(result.state).toBe("skipped-no-pr");
    } finally {
      process.env.GITHUB_EVENT_NAME = previous;
    }
  });

  it("skips when the GitHub token is missing on a pull request event", async () => {
    const previous = {
      GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    };

    try {
      process.env.GITHUB_EVENT_NAME = "pull_request";
      delete process.env.GITHUB_TOKEN;

      const result = await publishPrComment(
        { rendered: renderPolicyDecision({
          decisionId: "dec-observe-4",
          decisionKind: "observe",
          reason: "Advisory.",
        }) },
        { warning: vi.fn() },
      );

      expect(result.state).toBe("skipped-no-token");
    } finally {
      process.env.GITHUB_EVENT_NAME = previous.GITHUB_EVENT_NAME;
      process.env.GITHUB_TOKEN = previous.GITHUB_TOKEN;
    }
  });

  it("skips with skipped-permission for read-only token behavior", async () => {
    const context = mockPrContext();
    const warning = vi.fn();

    const result = await publishPrComment(
      { rendered: renderPolicyDecision({
        decisionId: "dec-observe-5",
        decisionKind: "observe",
        reason: "Advisory.",
      }) },
      {
        readContext: () => context,
        client: {
          listIssueComments: vi.fn().mockRejectedValue(new GitHubApiError(403, "forbidden")),
          createIssueComment: vi.fn(),
          updateIssueComment: vi.fn(),
        },
        warning,
      },
    );

    expect(result.state).toBe("skipped-permission");
    expect(warning).toHaveBeenCalledWith(
      "Control9 skipped pull request comment: insufficient GitHub token permissions.",
    );
  });

  it("returns failed-fallback without blocking observe decisions", async () => {
    const context = mockPrContext();
    const warning = vi.fn();

    const result = await publishPrComment(
      { rendered: renderPolicyDecision({
        decisionId: "dec-observe-6",
        decisionKind: "observe",
        reason: "Advisory.",
      }) },
      {
        readContext: () => context,
        client: {
          listIssueComments: vi.fn().mockRejectedValue(new Error("network down")),
          createIssueComment: vi.fn(),
          updateIssueComment: vi.fn(),
        },
        warning,
      },
    );

    expect(result.state).toBe("failed-fallback");
    expect(warning).toHaveBeenCalled();
  });

  it("does not create duplicate visible comments when reruns share workflow context", async () => {
    const context = mockPrContext();
    const marker = buildCommentMarker(context);
    const rendered = renderPolicyDecision({
      decisionId: "dec-observe-rerun",
      decisionKind: "observe",
      reason: "Rerun advisory.",
    });
    const createIssueComment = vi.fn();
    const updateIssueComment = vi.fn().mockResolvedValue({ id: 7001, body: "updated" });

    await publishPrComment(
      { rendered },
      {
        readContext: () => context,
        client: {
          listIssueComments: vi
            .fn()
            .mockResolvedValue([{ id: 7001, body: `${marker}\n\nFirst run` }]),
          createIssueComment,
          updateIssueComment,
        },
        warning: vi.fn(),
      },
    );

    expect(createIssueComment).not.toHaveBeenCalled();
    expect(updateIssueComment).toHaveBeenCalledOnce();
  });
});
