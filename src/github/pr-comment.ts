import { readFileSync } from "node:fs";

import * as core from "@actions/core";

import type { RenderedDecisionFeedback } from "../rendering/types";
import { buildWorkflowSummarySection } from "./workflow-summary";

export const CONTROL9_COMMENT_MARKER_PREFIX = "control9-pr-feedback";

export type PrCommentState =
  | "created"
  | "updated"
  | "skipped-no-pr"
  | "skipped-no-token"
  | "skipped-permission"
  | "failed-fallback";

export interface PrCommentContext {
  apiUrl: string;
  token: string;
  owner: string;
  repo: string;
  pullRequestNumber: number;
  workflow: string;
  job: string;
  eventName: string;
}

export interface GitHubIssueComment {
  id: number;
  body: string;
}

export interface GitHubCommentsClient {
  listIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GitHubIssueComment[]>;
  createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<GitHubIssueComment>;
  updateIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ): Promise<GitHubIssueComment>;
}

export interface PublishPrCommentInput {
  rendered: RenderedDecisionFeedback;
}

export interface PublishPrCommentResult {
  state: PrCommentState;
  commentId?: number;
}

export interface PublishPrCommentDependencies {
  readContext: () => PrCommentContext | undefined;
  client: GitHubCommentsClient;
  warning: (message: string) => void;
}

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function isPullRequestEvent(eventName: string): boolean {
  return eventName === "pull_request" || eventName === "pull_request_target";
}

function readPullRequestNumberFromEvent(eventPath: string): number | undefined {
  try {
    const payload = JSON.parse(readFileSync(eventPath, "utf8")) as {
      pull_request?: { number?: number };
    };
    const number = payload.pull_request?.number;
    if (typeof number === "number" && Number.isFinite(number) && number > 0) {
      return number;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function buildCommentMarker(context: Pick<PrCommentContext, "workflow" | "job">): string {
  return `<!-- ${CONTROL9_COMMENT_MARKER_PREFIX}:workflow=${context.workflow}:job=${context.job} -->`;
}

export function buildPrCommentBody(
  rendered: RenderedDecisionFeedback,
  marker: string,
): string {
  return `${marker}\n\n${buildWorkflowSummarySection(rendered)}`;
}

export function readPrCommentContextFromEnv(): PrCommentContext | undefined {
  const eventName = readEnv("GITHUB_EVENT_NAME");
  if (!isPullRequestEvent(eventName)) {
    return undefined;
  }

  const eventPath = readEnv("GITHUB_EVENT_PATH");
  const pullRequestNumber = eventPath ? readPullRequestNumberFromEvent(eventPath) : undefined;
  if (!pullRequestNumber) {
    return undefined;
  }

  const token = readEnv("GITHUB_TOKEN");
  if (!token) {
    return undefined;
  }

  const repository = readEnv("GITHUB_REPOSITORY");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    return undefined;
  }

  return {
    apiUrl: readEnv("GITHUB_API_URL") || "https://api.github.com",
    token,
    owner,
    repo,
    pullRequestNumber,
    workflow: readEnv("GITHUB_WORKFLOW") || "workflow",
    job: readEnv("GITHUB_JOB") || "job",
    eventName,
  };
}

function isPermissionError(error: unknown): boolean {
  return error instanceof GitHubApiError && isPermissionErrorStatus(error.status);
}

function isPermissionErrorStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GitHubApiError";
  }
}

export function createFetchGitHubCommentsClient(
  apiUrl: string,
  token: string,
): GitHubCommentsClient {
  const baseUrl = apiUrl.replace(/\/$/, "");

  async function request<T>(
    method: string,
    path: string,
    body?: { body: string },
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new GitHubApiError(response.status, `GitHub API ${method} ${path} failed`);
    }

    return (await response.json()) as T;
  }

  return {
    async listIssueComments(owner, repo, issueNumber) {
      return request<GitHubIssueComment[]>(
        "GET",
        `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      );
    },
    async createIssueComment(owner, repo, issueNumber, commentBody) {
      return request<GitHubIssueComment>(
        "POST",
        `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        { body: commentBody },
      );
    },
    async updateIssueComment(owner, repo, commentId, commentBody) {
      return request<GitHubIssueComment>(
        "PATCH",
        `/repos/${owner}/${repo}/issues/comments/${commentId}`,
        { body: commentBody },
      );
    },
  };
}

function findExistingComment(
  comments: GitHubIssueComment[],
  marker: string,
): GitHubIssueComment | undefined {
  return comments.find((comment) => comment.body.includes(marker));
}

export async function publishPrComment(
  input: PublishPrCommentInput,
  deps: Partial<PublishPrCommentDependencies> = {},
): Promise<PublishPrCommentResult> {
  const resolved: PublishPrCommentDependencies = {
    readContext: readPrCommentContextFromEnv,
    warning: (message) => {
      core.warning(message);
    },
    client: createFetchGitHubCommentsClient(
      readEnv("GITHUB_API_URL") || "https://api.github.com",
      readEnv("GITHUB_TOKEN"),
    ),
    ...deps,
  };

  const context = resolved.readContext();
  if (!context) {
    const eventName = readEnv("GITHUB_EVENT_NAME");
    if (!isPullRequestEvent(eventName)) {
      return { state: "skipped-no-pr" };
    }

    if (!readEnv("GITHUB_TOKEN")) {
      return { state: "skipped-no-token" };
    }

    return { state: "skipped-no-pr" };
  }

  const marker = buildCommentMarker(context);
  const body = buildPrCommentBody(input.rendered, marker);

  try {
    const comments = await resolved.client.listIssueComments(
      context.owner,
      context.repo,
      context.pullRequestNumber,
    );
    const existing = findExistingComment(comments, marker);

    if (existing) {
      const updated = await resolved.client.updateIssueComment(
        context.owner,
        context.repo,
        existing.id,
        body,
      );
      return { state: "updated", commentId: updated.id };
    }

    const created = await resolved.client.createIssueComment(
      context.owner,
      context.repo,
      context.pullRequestNumber,
      body,
    );
    return { state: "created", commentId: created.id };
  } catch (error) {
    if (isPermissionError(error)) {
      resolved.warning(
        "Control9 skipped pull request comment: insufficient GitHub token permissions.",
      );
      return { state: "skipped-permission" };
    }

    const message = error instanceof Error ? error.message : String(error);
    resolved.warning(
      `Control9 pull request comment failed; workflow summary and logs remain available. ${message}`,
    );
    return { state: "failed-fallback" };
  }
}
