# Policy Envelope Submission

## Introduction

Policy Envelope Submission is the core Control9 Integrations capability for customer CI pipelines. The GitHub Action acts as a customer-edge enforcement and reporting point: it gathers supported IaC and deploy context, redacts sensitive data locally, signs a normalized action envelope, requests a Control9 policy decision, and renders the result where developers already work.

This spec covers the GitHub Action path. GitLab CI is a later expansion and should reuse the same envelope, redaction, signing, decision normalization, and rendering concepts once its provider surface is contracted.

## Functional Specification

The action accepts workflow inputs for runtime mode, Control9 API base URL, tenant or installation identity, signing secret, target environment, requested authority, IaC tool, command category, artifact paths, working directory, and optional redaction configuration. Shadow mode is the default first-install mode.

The first supported artifact families are Terraform/OpenTofu plan JSON and CDK/CloudFormation synth or diff artifacts. Command handling groups work into plan, synth, diff, deploy verification, and shell deploy classification, with deploy verification call placement still tracked as an open implementation decision in the integration contract.

For each evaluated command or artifact group, the action builds one signed, redacted action envelope and submits it to the Control9 policy decision boundary. Policy responses are normalized into `allow`, `deny`, `require_approval`, or `observe` with reason text, optional risk summary, policy version, decision id, and follow-up metadata for workflow, PR, or merge request rendering.

The integration does not evaluate full policy packs locally and is not the durable system of record. Malformed configuration, invalid signatures, unsupported artifacts, and schema validation failures return actionable local errors. Transient network or server failures may retry with bounded backoff inside the CI job timeout.

## Technical Specification

The package is a Node-based GitHub Action with `runs.using: node20`. `package.json` requires Node `>=20`, builds the distributable with `@vercel/ncc`, uses TypeScript `5.8.x`, validates schemas with AJV `8.x`, and runs tests with Vitest `3.x`.

Envelope construction is remote-client oriented and mockable. Request construction must be deterministic and covered by fixtures so policy client behavior can be validated without a live Control9 API. Redaction happens before signing and submission, and secrets must be supplied through GitHub Actions inputs and secrets rather than persisted in generated artifacts.

The decision client treats Control9 APIs as remote boundaries. The action submits normalized evidence and receives a normalized policy decision; rendering code consumes that normalized decision rather than raw provider-specific API payloads.

## Testing Strategy

Testing should cover parsing supported IaC artifacts, normalizing action envelope content, redacting secrets, computing stable fingerprints, signing envelopes, mapping policy decisions, and rendering workflow or PR feedback. Fixture coverage should include successful decisions, malformed input, unsupported artifact versions, secrets requiring redaction, and policy responses for `allow`, `deny`, `require_approval`, and `observe`.

Local verification uses the repository scripts from `package.json`: `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build`. CI or release checks should verify that the generated `dist/` bundle matches source changes because the action runs from bundled JavaScript.

## References

- `.ai/business_logic/domain_model.md` - customer-edge role, supported command groups, and remote policy decision ownership.
- `.ai/integration/api_contracts.md` - signed redacted envelope submission, remote API boundary, retry semantics, and normalized decision shape.
- `action.yml` - GitHub Action inputs, outputs, and Node 20 runtime.
- `package.json` - Node engine, build, lint, typecheck, and test commands.
