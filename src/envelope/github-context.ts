import { randomUUID } from "node:crypto";

import type { GitHubWorkflowContext } from "./types";

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();
  if (value) {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  return "";
}

function parsePullRequestNumber(): number | undefined {
  const eventPath = process.env.GITHUB_EVENT_PATH?.trim();
  if (!eventPath) {
    const fromEnv = readEnv("GITHUB_EVENT_PULL_REQUEST_NUMBER");
    if (fromEnv) {
      const parsed = Number.parseInt(fromEnv, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  return undefined;
}

export function readGitHubWorkflowContext(): GitHubWorkflowContext {
  const owner = readEnv("GITHUB_REPOSITORY_OWNER", "local-owner");
  const name = readEnv("GITHUB_REPOSITORY", `${owner}/local-repo`).split("/").pop() || "local-repo";
  const fullName = readEnv("GITHUB_REPOSITORY", `${owner}/${name}`);
  const correlationId =
    readEnv("GITHUB_RUN_ID") && readEnv("GITHUB_RUN_ATTEMPT")
      ? `${readEnv("GITHUB_RUN_ID")}:${readEnv("GITHUB_RUN_ATTEMPT")}`
      : randomUUID();

  return {
    correlationId,
    providerContext: {
      provider: "github",
      eventName: readEnv("GITHUB_EVENT_NAME", "workflow_dispatch") || undefined,
      apiUrl: readEnv("GITHUB_API_URL", "https://api.github.com") || undefined,
    },
    runIdentity: {
      runId: readEnv("GITHUB_RUN_ID", "0"),
      runAttempt: readEnv("GITHUB_RUN_ATTEMPT", "1"),
      workflow: readEnv("GITHUB_WORKFLOW", "local-workflow"),
      job: readEnv("GITHUB_JOB", "local-job"),
    },
    repositoryIdentity: {
      owner,
      name,
      fullName,
    },
    refOrPullRequestIdentity: {
      ref: readEnv("GITHUB_REF", "refs/heads/main"),
      sha: readEnv("GITHUB_SHA", "0000000000000000000000000000000000000000"),
      pullRequestNumber: parsePullRequestNumber(),
    },
    actorIdentity: {
      login: readEnv("GITHUB_ACTOR", "local-actor"),
      actorType: readEnv("GITHUB_ACTOR", "local-actor").endsWith("[bot]") ? "Bot" : "User",
    },
  };
}
