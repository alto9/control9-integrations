import type { ActionInputs, RoutedCommand } from "../types";
import { Control9ActionError } from "../types";
import { fingerprintArtifacts } from "../routing";
import { readGitHubWorkflowContext } from "./github-context";
import type { WorkflowContext } from "./types";
import { buildUnsignedEnvelopeId, signEnvelope } from "./sign";
import { containsRawSecretMarkers, redactPayload } from "./redact";
import { buildNormalizedChangeSummary } from "./summary";
import type { ActionEnvelope, ArtifactFingerprintEntry } from "./types";
import { ENVELOPE_SCHEMA_VERSION } from "./types";
import { validateActionEnvelopeSchema } from "./validate-schema";

export interface BuildEnvelopeOptions {
  signedAt?: string;
  /** Injected CI workflow context; defaults to GitHub when omitted. */
  workflowContext?: WorkflowContext;
  /** @deprecated Use {@link BuildEnvelopeOptions.workflowContext} */
  githubContext?: WorkflowContext;
}

function buildArtifactFingerprints(routed: RoutedCommand): ArtifactFingerprintEntry[] {
  return routed.artifactPaths.map((artifactPath, index) => ({
    path: artifactPath,
    fingerprint: fingerprintArtifacts([routed.resolvedArtifactPaths[index]]),
  }));
}

export function buildSignedActionEnvelope(
  inputs: ActionInputs,
  routed: RoutedCommand,
  options: BuildEnvelopeOptions = {},
): ActionEnvelope {
  const workflowContext =
    options.workflowContext ?? options.githubContext ?? readGitHubWorkflowContext();
  const rawSummary = buildNormalizedChangeSummary(inputs, routed);
  const redactionProfile = inputs.redactionProfile ?? "standard";
  const { redacted, report } = redactPayload(
    rawSummary,
    redactionProfile,
    inputs.redactionAdditionalPatterns,
  );

  if (containsRawSecretMarkers(redacted, inputs.redactionAdditionalPatterns)) {
    throw new Control9ActionError(
      "Redaction failed: normalized change summary still contains sensitive values matching the active redaction profile.",
    );
  }

  const unsignedBody = {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    correlationId: workflowContext.correlationId,
    providerContext: workflowContext.providerContext,
    runIdentity: workflowContext.runIdentity,
    tenantIdentity: {
      tenantId: inputs.tenantId,
    },
    repositoryIdentity: workflowContext.repositoryIdentity,
    refOrPullRequestIdentity: workflowContext.refOrPullRequestIdentity,
    actorIdentity: workflowContext.actorIdentity,
    commandCategory: routed.command,
    iacTool: routed.iacTool,
    environment: inputs.targetEnvironment,
    requestedAuthority: inputs.requestedAuthority,
    runtimeMode: inputs.mode,
    normalizedChangeSummary: redacted as typeof rawSummary,
    redactionReport: report,
    artifactFingerprints: buildArtifactFingerprints(routed),
  };

  const envelopeId = buildUnsignedEnvelopeId(unsignedBody);
  const unsigned = {
    ...unsignedBody,
    envelopeId,
  };

  const signed = signEnvelope(unsigned, inputs.signingSecret, options.signedAt);
  validateActionEnvelopeSchema(signed);
  return signed;
}
