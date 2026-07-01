import { appendFileSync } from "node:fs";

import {
  buildLogFallbackLines,
  buildWorkflowSummarySection,
  resolveSummarySectionHeading,
  type WorkflowFeedbackPresentation,
} from "../github/workflow-summary";
import type { RenderedDecisionFeedback } from "../rendering/types";
import { buildBaselineLogLines } from "./log-output";

export const POLICY_SECTION_ID = "control9-policy-decision";
export const DEPLOY_VERIFICATION_SECTION_ID = "control9-deploy-verification";
export const DISABLE_SECTION_MARKERS_ENV = "CONTROL9_DISABLE_JOB_LOG_SECTIONS";
export const GITLAB_OUTPUT_ENV = "GITLAB_ENV";

export type GitLabJobLogPresentation = WorkflowFeedbackPresentation;

export interface PublishGitLabJobFeedbackInput {
  rendered: RenderedDecisionFeedback;
  summaryPath?: string;
  presentation?: GitLabJobLogPresentation;
}

export interface GitLabJobFeedbackResult {
  sectionWritten: boolean;
  usedLogFallback: boolean;
}

export interface GitLabJobFeedbackDependencies {
  log: (line: string) => void;
  canWriteSections: () => boolean;
  nowSeconds: () => number;
}

function resolveSectionId(presentation: GitLabJobLogPresentation = "policy"): string {
  return presentation === "deploy-verification"
    ? DEPLOY_VERIFICATION_SECTION_ID
    : POLICY_SECTION_ID;
}

export function buildLogPrefixLine(rendered: RenderedDecisionFeedback): string {
  const prefix = rendered.blocksWorkflow ? "Control9 WARNING" : "Control9 NOTICE";
  return `${prefix}: ${rendered.annotationMessage}`;
}

export function buildSectionStartMarker(
  sectionId: string,
  sectionHeader: string,
  timestampSeconds: number,
): string {
  return `\u001b[0Ksection_start:${timestampSeconds}:${sectionId}\r\u001b[0K${sectionHeader}`;
}

export function buildSectionEndMarker(sectionId: string, timestampSeconds: number): string {
  return `\u001b[0Ksection_end:${timestampSeconds}:${sectionId}\r\u001b[0K`;
}

export function buildSectionBodyLines(
  rendered: RenderedDecisionFeedback,
  presentation: GitLabJobLogPresentation = "policy",
): string[] {
  const sectionMarkdown = buildWorkflowSummarySection(rendered, presentation);
  const headingLine = `## ${resolveSummarySectionHeading(presentation)}`;
  return sectionMarkdown
    .split("\n")
    .filter((line) => line !== headingLine && line.trim() !== "");
}

function defaultDependencies(): GitLabJobFeedbackDependencies {
  return {
    log: (line) => {
      console.log(line);
    },
    canWriteSections: () => process.env[DISABLE_SECTION_MARKERS_ENV]?.trim() !== "true",
    nowSeconds: () => Math.floor(Date.now() / 1000),
  };
}

export function publishGitLabJobFeedback(
  input: PublishGitLabJobFeedbackInput,
  deps: Partial<GitLabJobFeedbackDependencies> = {},
): GitLabJobFeedbackResult {
  const resolved = { ...defaultDependencies(), ...deps };
  const presentation = input.presentation ?? "policy";
  const sectionId = resolveSectionId(presentation);
  const sectionHeader = resolveSummarySectionHeading(presentation);

  resolved.log(buildLogPrefixLine(input.rendered));

  if (!resolved.canWriteSections()) {
    for (const line of buildBaselineLogLines(input.rendered, presentation)) {
      resolved.log(line);
    }
    if (input.summaryPath) {
      resolved.log(`Control9 summary JSON: ${input.summaryPath}`);
    }
    return { sectionWritten: false, usedLogFallback: true };
  }

  const startTimestamp = resolved.nowSeconds();
  resolved.log(buildSectionStartMarker(sectionId, sectionHeader, startTimestamp));
  for (const line of buildSectionBodyLines(input.rendered, presentation)) {
    resolved.log(line);
  }
  resolved.log(buildSectionEndMarker(sectionId, startTimestamp + 1));

  if (input.summaryPath) {
    resolved.log(`Control9 summary JSON: ${input.summaryPath}`);
  }

  return { sectionWritten: true, usedLogFallback: false };
}

export function writeGitLabPresentationOutputs(result: GitLabJobFeedbackResult): void {
  const outputFile = process.env[GITLAB_OUTPUT_ENV]?.trim();
  if (!outputFile) {
    return;
  }

  appendFileSync(
    outputFile,
    [
      `CONTROL9_JOB_SECTION_WRITTEN=${String(result.sectionWritten)}`,
      `CONTROL9_USED_LOG_FALLBACK=${String(result.usedLogFallback)}`,
    ].join("\n") + "\n",
    "utf8",
  );
}

export { buildLogFallbackLines };
