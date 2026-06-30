# Serialization

This doc describes boundary shapes, redaction expectations, fingerprints, summaries, and exported representations at a product level.

## Contract

- Integration data is transient customer-edge data: local configuration, summaries, fingerprints, signatures, envelopes, and rendered decision output.
- Action envelopes include actor, repo, branch, tool, target, environment, intent, diff summary, requested authority, and artifact fingerprints at a product level.
- Envelope schema version is `control9.action-envelope.v0`. Unsigned payloads are canonicalized to stable JSON field ordering before fingerprinting and signing.

## Local configuration shape

GitHub Action inputs map to the runtime configuration classes in `.ai/runtime/configuration.md`. There is no parallel YAML or JSON config file for the first GitHub Action path. Optional inputs inherit documented defaults; required inputs must be present before artifact reads.

## Default include rules (evidence capture)

By default the integration **includes** in the signed envelope:

- Provider, run, repository, ref or pull request, and actor identity from the GitHub workflow context.
- Normalized change summaries derived from supported artifacts: Terraform/OpenTofu plan summaries, CDK/CloudFormation template summaries, resource action counts, resource addresses or logical IDs needed for policy evidence, provider or stack hints, and artifact fingerprints.
- Redaction report with profile name, marker list, value classes, and total redaction count.
- Signature metadata covering the canonical unsigned envelope body.

## Default exclude rules (evidence capture)

By default the integration **excludes** from outbound payloads:

- Raw secrets, tokens, private keys, and environment variable values (replaced by explicit redaction markers when detected).
- Full repository source code.
- Full human-oriented CLI output or unstructured log streams.
- Signing secrets and API tokens (never serialized, logged, or written to action outputs).
- Complete pre-normalization artifact files (only normalized summaries and fingerprints cross the boundary).

Redaction runs on the normalized change summary before signing. If values matching the active profile remain after redaction, envelope construction fails locally.

## Opt-in full-output capture controls

The GitHub Shadow Mode Install milestone supports **summary-only** capture only. No action input enables submission of full artifact files, full command output, or extended raw evidence to Control9.

Future milestones may add an explicit opt-in input (for example `evidence-capture: summary-only | extended-artifact`) under tenant policy constraints. Until that input exists, customers should assume summary-only behavior documented above.

Optional `redaction-additional-patterns` is the supported customer-controlled extension point for classifying extra sensitive strings before serialization. It does not opt in to full-output capture.

## Signing serialization

- Unsigned envelope bodies are canonicalized JSON.
- Signatures use HMAC-SHA256 over the canonical unsigned payload.
- `keyId` is a truncated SHA-256 fingerprint of the signing secret material for correlation without exposing the secret.
