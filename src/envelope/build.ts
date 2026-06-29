import type { ActionInputs, RoutedCommand } from "../types";
import { fingerprintArtifacts } from "../routing";
import { readGitHubWorkflowContext } from "./github-context";
import { buildUnsignedEnvelopeId, signEnvelope } from "./sign";
import { redactPayload } from "./redact";
import { buildNormalizedChangeSummary } from "./summary";
import type { ActionEnvelope, ArtifactFingerprintEntry } from "./types";
import { ENVELOPE_SCHEMA_VERSION } from "./types";

export interface BuildEnvelopeOptions {
  signedAt?: string;
  githubContext?: ReturnType<typeof readGitHubWorkflowContext>;
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
  const githubContext = options.githubContext ?? readGitHubWorkflowContext();
  const rawSummary = buildNormalizedChangeSummary(inputs, routed);
  const redactionProfile = inputs.redactionProfile ?? "standard";
  const { redacted, report } = redactPayload(
    rawSummary,
    redactionProfile,
    inputs.redactionAdditionalPatterns,
  );

  const unsignedBody = {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    correlationId: githubContext.correlationId,
    providerContext: githubContext.providerContext,
    runIdentity: githubContext.runIdentity,
    tenantIdentity: {
      tenantId: inputs.tenantId,
    },
    repositoryIdentity: githubContext.repositoryIdentity,
    refOrPullRequestIdentity: githubContext.refOrPullRequestIdentity,
    actorIdentity: githubContext.actorIdentity,
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

  return signEnvelope(unsigned, inputs.signingSecret, options.signedAt);
}
