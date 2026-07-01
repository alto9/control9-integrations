import type { RenderedDecisionFeedback } from "../rendering/types";
import {
  DEPLOY_VERIFICATION_SECTION_HEADING,
  SUMMARY_SECTION_HEADING,
} from "../github/workflow-summary";

export type GitLabLogPresentation = "policy" | "deploy-verification";

export interface PublishBaselineLogFeedbackInput {
  rendered: RenderedDecisionFeedback;
  summaryPath?: string;
  presentation?: GitLabLogPresentation;
}

export interface BaselineLogFeedbackResult {
  summaryWritten: false;
}

function resolveSectionHeading(presentation: GitLabLogPresentation = "policy"): string {
  return presentation === "deploy-verification"
    ? DEPLOY_VERIFICATION_SECTION_HEADING
    : SUMMARY_SECTION_HEADING;
}

export function buildBaselineLogLines(
  rendered: RenderedDecisionFeedback,
  presentation: GitLabLogPresentation = "policy",
): string[] {
  const heading = resolveSectionHeading(presentation);
  const prefix = rendered.blocksWorkflow ? "Control9 WARNING" : "Control9 NOTICE";
  return [
    `${prefix}: ${rendered.label} — ${rendered.summary}`,
    heading,
    rendered.title,
    rendered.summary,
    ...rendered.detailLines.map((line) => `- ${line}`),
  ];
}

export function publishBaselineLogFeedback(
  input: PublishBaselineLogFeedbackInput,
): BaselineLogFeedbackResult {
  const presentation = input.presentation ?? "policy";
  for (const line of buildBaselineLogLines(input.rendered, presentation)) {
    console.log(line);
  }
  if (input.summaryPath) {
    console.log(`Control9 summary JSON: ${input.summaryPath}`);
  }
  return { summaryWritten: false };
}
