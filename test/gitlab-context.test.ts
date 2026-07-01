import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readGitLabWorkflowContext } from "../src/envelope/gitlab-context";

interface GitLabPipelineFixture {
  description: string;
  env: Record<string, string>;
  expected: {
    providerContext: { provider: string; apiUrl?: string };
    runIdentity: { runId: string; runAttempt: string; workflow: string; job: string };
    repositoryIdentity: { owner: string; name: string; fullName: string };
    refOrPullRequestIdentity: {
      ref: string;
      sha: string;
      pullRequestNumber?: number;
    };
    actorIdentity: { login: string; actorType: string };
    correlationId: string;
  };
}

const defaultBranchFixture = JSON.parse(
  readFileSync("fixtures/gitlab/default-branch-pipeline.json", "utf8"),
) as GitLabPipelineFixture;
const mergeRequestFixture = JSON.parse(
  readFileSync("fixtures/gitlab/merge-request-pipeline.json", "utf8"),
) as GitLabPipelineFixture;

function applyGitLabEnv(env: Record<string, string>): void {
  for (const key of [
    "CI_PROJECT_PATH",
    "CI_PIPELINE_ID",
    "CI_JOB_ID",
    "CI_PIPELINE_SOURCE",
    "CI_JOB_NAME",
    "CI_COMMIT_REF_NAME",
    "CI_COMMIT_SHA",
    "CI_MERGE_REQUEST_IID",
    "GITLAB_USER_LOGIN",
    "CI_SERVER_URL",
  ]) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
}

describe("readGitLabWorkflowContext", () => {
  let previousEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    previousEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = previousEnv;
  });

  it.each([
    ["default-branch-pipeline.json", defaultBranchFixture],
    ["merge-request-pipeline.json", mergeRequestFixture],
  ] as const)("maps %s fixture CI variables to the shared workflow context shape", (_file, fixture) => {
    applyGitLabEnv(fixture.env);

    const context = readGitLabWorkflowContext();

    expect(context.providerContext).toEqual(fixture.expected.providerContext);
    expect(context.runIdentity).toEqual(fixture.expected.runIdentity);
    expect(context.repositoryIdentity).toEqual(fixture.expected.repositoryIdentity);
    expect(context.refOrPullRequestIdentity).toEqual(fixture.expected.refOrPullRequestIdentity);
    expect(context.actorIdentity).toEqual(fixture.expected.actorIdentity);
    expect(context.correlationId).toBe(fixture.expected.correlationId);
  });

  it("falls back to job name for workflow when pipeline source is absent", () => {
    delete process.env.CI_PIPELINE_SOURCE;
    process.env.CI_JOB_NAME = "control9";
    process.env.CI_PROJECT_PATH = "group/project";

    const context = readGitLabWorkflowContext();

    expect(context.runIdentity.workflow).toBe("control9");
  });

  it("omits merge request number when CI_MERGE_REQUEST_IID is unset", () => {
    process.env.CI_PROJECT_PATH = "group/project";
    delete process.env.CI_MERGE_REQUEST_IID;

    const context = readGitLabWorkflowContext();

    expect(context.refOrPullRequestIdentity.pullRequestNumber).toBeUndefined();
  });
});
