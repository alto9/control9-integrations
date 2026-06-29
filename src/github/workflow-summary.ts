import { appendFile } from "node:fs/promises";

import * as core from "@actions/core";

import type { RenderedDecisionFeedback } from "../rendering/types";
import { publishPrComment, type PrCommentState } from "./pr-comment";

export const SUMMARY_ENV_VAR = "GITHUB_STEP_SUMMARY";
export const SUMMARY_SECTION_HEADING = "Control9 Policy Decision";

export type { PrCommentState };

export interface PublishWorkflowFeedbackInput {
  rendered: RenderedDecisionFeedback;
  summaryPath?: string;
}

export interface WorkflowFeedbackResult {
  summaryWritten: boolean;
  prCommentState: PrCommentState;
  usedLogFallback: boolean;
}

export interface WorkflowFeedbackDependencies {
  appendSummary: (markdown: string) => Promise<boolean>;
  notice: (message: string, properties?: core.AnnotationProperties) => void;
  warning: (message: string, properties?: core.AnnotationProperties) => void;
  info: (message: string) => void;
}

export function buildWorkflowSummarySection(rendered: RenderedDecisionFeedback): string {
  return [`## ${SUMMARY_SECTION_HEADING}`, "", rendered.bodyMarkdown].join("\n");
}

export function buildLogFallbackLines(rendered: RenderedDecisionFeedback): string[] {
  return [
    `## ${SUMMARY_SECTION_HEADING}`,
    rendered.label,
    rendered.summary,
    ...rendered.detailLines.map((line) => `- ${line}`),
  ];
}

export function emitDecisionAnnotation(
  rendered: RenderedDecisionFeedback,
  deps: Pick<WorkflowFeedbackDependencies, "notice" | "warning">,
): void {
  const properties: core.AnnotationProperties = { title: rendered.label };

  if (rendered.blocksWorkflow) {
    deps.warning(rendered.annotationMessage, properties);
    return;
  }

  deps.notice(rendered.annotationMessage, properties);
}

export async function appendWorkflowSummary(markdown: string): Promise<boolean> {
  const summaryPath = process.env[SUMMARY_ENV_VAR]?.trim();
  if (!summaryPath) {
    return false;
  }

  try {
    await appendFile(summaryPath, `${markdown}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function defaultDependencies(): WorkflowFeedbackDependencies {
  return {
    appendSummary: appendWorkflowSummary,
    notice: (message, properties) => {
      core.notice(message, properties);
    },
    warning: (message, properties) => {
      core.warning(message, properties);
    },
    info: (message) => {
      core.info(message);
    },
  };
}

export async function publishWorkflowFeedback(
  input: PublishWorkflowFeedbackInput,
  deps: Partial<WorkflowFeedbackDependencies> = {},
): Promise<WorkflowFeedbackResult> {
  const resolved = { ...defaultDependencies(), ...deps };
  const sectionMarkdown = buildWorkflowSummarySection(input.rendered);

  emitDecisionAnnotation(input.rendered, resolved);

  const summaryWritten = await resolved.appendSummary(sectionMarkdown);
  let usedLogFallback = false;

  if (!summaryWritten) {
    usedLogFallback = true;
    for (const line of buildLogFallbackLines(input.rendered)) {
      resolved.info(line);
    }
    if (input.summaryPath) {
      resolved.info(`Local summary JSON: ${input.summaryPath}`);
    }
  }

  const prComment = await publishPrComment({ rendered: input.rendered });

  return {
    summaryWritten,
    prCommentState: prComment.state,
    usedLogFallback,
  };
}
