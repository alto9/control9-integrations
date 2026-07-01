import { randomUUID } from "node:crypto";

import type { WorkflowContext } from "./types";

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

function parseProjectPath(fullPath: string): { owner: string; name: string } {
  const segments = fullPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { owner: "local-group", name: "local-project" };
  }
  if (segments.length === 1) {
    return { owner: segments[0] ?? "local-group", name: segments[0] ?? "local-project" };
  }
  return {
    owner: segments.slice(0, -1).join("/"),
    name: segments[segments.length - 1] ?? "local-project",
  };
}

function parseMergeRequestNumber(): number | undefined {
  const raw = readEnv("CI_MERGE_REQUEST_IID");
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readGitLabWorkflowContext(): WorkflowContext {
  const fullName = readEnv("CI_PROJECT_PATH", "local-group/local-project");
  const { owner, name } = parseProjectPath(fullName);
  const pipelineId = readEnv("CI_PIPELINE_ID");
  const jobId = readEnv("CI_JOB_ID");
  const correlationId =
    pipelineId && jobId ? `${pipelineId}:${jobId}` : randomUUID();
  const pipelineSource = readEnv("CI_PIPELINE_SOURCE");
  const jobName = readEnv("CI_JOB_NAME", "local-job");
  const workflow = pipelineSource || jobName;
  const login = readEnv("GITLAB_USER_LOGIN", "local-user");

  return {
    correlationId,
    providerContext: {
      provider: "gitlab",
      apiUrl: readEnv("CI_SERVER_URL", "https://gitlab.com") || undefined,
    },
    runIdentity: {
      runId: pipelineId || "0",
      runAttempt: jobId || "1",
      workflow,
      job: jobName,
    },
    repositoryIdentity: {
      owner,
      name,
      fullName,
    },
    refOrPullRequestIdentity: {
      ref: readEnv("CI_COMMIT_REF_NAME", "main"),
      sha: readEnv("CI_COMMIT_SHA", "0000000000000000000000000000000000000000"),
      pullRequestNumber: parseMergeRequestNumber(),
    },
    actorIdentity: {
      login,
      actorType: login.endsWith("[bot]") || login.endsWith("_bot") ? "Bot" : "User",
    },
  };
}
