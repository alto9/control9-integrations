import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readGitLabWorkflowContext } from "../src/envelope/gitlab-context";

describe("readGitLabWorkflowContext", () => {
  let previousEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    previousEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = previousEnv;
  });

  it("maps GitLab predefined CI variables to the shared workflow context shape", () => {
    process.env.CI_PROJECT_PATH = "acme/platform/infra";
    process.env.CI_PIPELINE_ID = "987654";
    process.env.CI_JOB_ID = "1234567";
    process.env.CI_PIPELINE_SOURCE = "merge_request_event";
    process.env.CI_JOB_NAME = "control9-assessment";
    process.env.CI_COMMIT_REF_NAME = "feature/gitlab";
    process.env.CI_COMMIT_SHA = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    process.env.CI_MERGE_REQUEST_IID = "42";
    process.env.GITLAB_USER_LOGIN = "dev.user";
    process.env.CI_SERVER_URL = "https://gitlab.example.com";

    const context = readGitLabWorkflowContext();

    expect(context.providerContext).toEqual({
      provider: "gitlab",
      apiUrl: "https://gitlab.example.com",
    });
    expect(context.runIdentity).toEqual({
      runId: "987654",
      runAttempt: "1234567",
      workflow: "merge_request_event",
      job: "control9-assessment",
    });
    expect(context.repositoryIdentity).toEqual({
      owner: "acme/platform",
      name: "infra",
      fullName: "acme/platform/infra",
    });
    expect(context.refOrPullRequestIdentity).toEqual({
      ref: "feature/gitlab",
      sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      pullRequestNumber: 42,
    });
    expect(context.actorIdentity).toEqual({
      login: "dev.user",
      actorType: "User",
    });
    expect(context.correlationId).toBe("987654:1234567");
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
