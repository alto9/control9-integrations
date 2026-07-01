import type { WorkflowFeedbackPresentation } from "../github/workflow-summary";
import { buildWorkflowSummarySection } from "../github/workflow-summary";
import type { RenderedDecisionFeedback } from "../rendering/types";

export const CONTROL9_MR_MARKER_PREFIX = "control9-mr-feedback";

export type MrNoteState =
  | "created"
  | "updated"
  | "skipped-no-mr"
  | "skipped-no-token"
  | "skipped-permission"
  | "failed-fallback";

export interface MrNoteContext {
  apiBaseUrl: string;
  token: string;
  projectId: string;
  mergeRequestIid: number;
  pipelineId: string;
  jobName: string;
}

export interface GitLabMergeRequestNote {
  id: number;
  body: string;
}

export interface GitLabMrNotesClient {
  listMergeRequestNotes(
    projectId: string,
    mergeRequestIid: number,
  ): Promise<GitLabMergeRequestNote[]>;
  createMergeRequestNote(
    projectId: string,
    mergeRequestIid: number,
    body: string,
  ): Promise<GitLabMergeRequestNote>;
  updateMergeRequestNote(
    projectId: string,
    mergeRequestIid: number,
    noteId: number,
    body: string,
  ): Promise<GitLabMergeRequestNote>;
}

export interface PublishMrNoteInput {
  rendered: RenderedDecisionFeedback;
  presentation?: WorkflowFeedbackPresentation;
}

export interface PublishMrNoteResult {
  state: MrNoteState;
  noteId?: number;
}

export interface PublishMrNoteDependencies {
  readContext: () => MrNoteContext | undefined;
  client: GitLabMrNotesClient;
  warning: (message: string) => void;
}

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function readPositiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return undefined;
}

function resolveGitLabToken(): string {
  return (
    readEnv("CONTROL9_GITLAB_TOKEN") ||
    readEnv("GITLAB_TOKEN") ||
    readEnv("CI_JOB_TOKEN")
  );
}

export function buildMrNoteMarker(
  context: Pick<MrNoteContext, "pipelineId" | "jobName">,
): string {
  return `<!-- ${CONTROL9_MR_MARKER_PREFIX}:pipeline=${context.pipelineId}:job=${context.jobName} -->`;
}

export function buildMrNoteBody(
  rendered: RenderedDecisionFeedback,
  marker: string,
  presentation: WorkflowFeedbackPresentation = "policy",
): string {
  return `${marker}\n\n${buildWorkflowSummarySection(rendered, presentation)}`;
}

export function readMrNoteContextFromEnv(): MrNoteContext | undefined {
  const mergeRequestIid = readPositiveInteger(readEnv("CI_MERGE_REQUEST_IID"));
  if (!mergeRequestIid) {
    return undefined;
  }

  const token = resolveGitLabToken();
  if (!token) {
    return undefined;
  }

  const projectId = readEnv("CI_PROJECT_ID");
  const serverUrl = readEnv("CI_SERVER_URL");
  if (!projectId || !serverUrl) {
    return undefined;
  }

  return {
    apiBaseUrl: `${serverUrl.replace(/\/$/, "")}/api/v4`,
    token,
    projectId,
    mergeRequestIid,
    pipelineId: readEnv("CI_PIPELINE_ID") || "pipeline",
    jobName: readEnv("CI_JOB_NAME") || "job",
  };
}

function isPermissionError(error: unknown): boolean {
  return error instanceof GitLabApiError && isPermissionErrorStatus(error.status);
}

function isPermissionErrorStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export class GitLabApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GitLabApiError";
  }
}

export function createFetchGitLabMrNotesClient(
  apiBaseUrl: string,
  token: string,
): GitLabMrNotesClient {
  const baseUrl = apiBaseUrl.replace(/\/$/, "");
  const encodedProject = (projectId: string) => encodeURIComponent(projectId);

  async function request<T>(
    method: string,
    path: string,
    body?: { body: string },
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "PRIVATE-TOKEN": token,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new GitLabApiError(response.status, `GitLab API ${method} ${path} failed`);
    }

    return (await response.json()) as T;
  }

  return {
    async listMergeRequestNotes(projectId, mergeRequestIid) {
      return request<GitLabMergeRequestNote[]>(
        "GET",
        `/projects/${encodedProject(projectId)}/merge_requests/${mergeRequestIid}/notes`,
      );
    },
    async createMergeRequestNote(projectId, mergeRequestIid, noteBody) {
      return request<GitLabMergeRequestNote>(
        "POST",
        `/projects/${encodedProject(projectId)}/merge_requests/${mergeRequestIid}/notes`,
        { body: noteBody },
      );
    },
    async updateMergeRequestNote(projectId, mergeRequestIid, noteId, noteBody) {
      return request<GitLabMergeRequestNote>(
        "PUT",
        `/projects/${encodedProject(projectId)}/merge_requests/${mergeRequestIid}/notes/${noteId}`,
        { body: noteBody },
      );
    },
  };
}

function findExistingNote(
  notes: GitLabMergeRequestNote[],
  marker: string,
): GitLabMergeRequestNote | undefined {
  return notes.find((note) => note.body.includes(marker));
}

export async function publishMrNote(
  input: PublishMrNoteInput,
  deps: Partial<PublishMrNoteDependencies> = {},
): Promise<PublishMrNoteResult> {
  const presentation = input.presentation ?? "policy";
  const resolved: PublishMrNoteDependencies = {
    readContext: readMrNoteContextFromEnv,
    warning: (message) => {
      console.warn(message);
    },
    client: createFetchGitLabMrNotesClient(
      `${readEnv("CI_SERVER_URL").replace(/\/$/, "")}/api/v4`,
      resolveGitLabToken(),
    ),
    ...deps,
  };

  const context = resolved.readContext();
  if (!context) {
    if (!readPositiveInteger(readEnv("CI_MERGE_REQUEST_IID"))) {
      return { state: "skipped-no-mr" };
    }

    if (!resolveGitLabToken()) {
      return { state: "skipped-no-token" };
    }

    return { state: "skipped-no-mr" };
  }

  const marker = buildMrNoteMarker(context);
  const body = buildMrNoteBody(input.rendered, marker, presentation);

  try {
    const notes = await resolved.client.listMergeRequestNotes(
      context.projectId,
      context.mergeRequestIid,
    );
    const existing = findExistingNote(notes, marker);

    if (existing) {
      const updated = await resolved.client.updateMergeRequestNote(
        context.projectId,
        context.mergeRequestIid,
        existing.id,
        body,
      );
      return { state: "updated", noteId: updated.id };
    }

    const created = await resolved.client.createMergeRequestNote(
      context.projectId,
      context.mergeRequestIid,
      body,
    );
    return { state: "created", noteId: created.id };
  } catch (error) {
    if (isPermissionError(error)) {
      resolved.warning(
        "Control9 skipped merge request note: insufficient GitLab token permissions.",
      );
      return { state: "skipped-permission" };
    }

    const message = error instanceof Error ? error.message : String(error);
    resolved.warning(
      `Control9 merge request note failed; job log sections and prefixes remain available. ${message}`,
    );
    return { state: "failed-fallback" };
  }
}
