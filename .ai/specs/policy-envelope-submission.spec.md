# Policy Envelope Submission

## Introduction

Policy Envelope Submission is the core Control9 Integrations capability for customer CI pipelines. The GitHub Action and GitLab CI runner act as customer-edge enforcement and reporting points: they gather supported IaC and deploy context, redact sensitive data locally, sign a normalized action envelope, request a Control9 policy decision or deploy verification outcome, and render the result where developers already work.

GitLab reuses the same envelope, signing, HTTP endpoints, decision normalization, and blocking semantics as GitHub. Presentation differs by provider (workflow summary vs job log sections and merge request notes).

The authoritative SaaS HTTP contract is `control9/.ai/specs/ci-envelope-ingestion.spec.md`. This spec describes client behavior against that contract.

## Functional Specification

The action accepts workflow inputs for runtime mode, Control9 API base URL, tenant identity, signing secret, target environment, requested authority, IaC tool, command category, artifact paths, working directory, and optional redaction configuration. Shadow mode is the default first-install mode. Integration input `shadow` covers shadow, observe, and dry-run runtime semantics; input `enforce` covers enforce and approval-required blocking semantics.

The first supported artifact families are Terraform/OpenTofu plan JSON and CDK/CloudFormation synth or diff artifacts. Command handling groups work into plan, synth, diff, and deploy verification. Deploy verification is a **separate workflow step immediately before protected deploy authority** (see `.ai/integration/api_contracts.md` workflow placement table).

### Policy envelope submission API

When `command` is not `deploy-verification`, the client calls the policy evaluation boundary:

- **Endpoint:** `POST {apiBaseUrl}/v1/action-envelopes` (trailing slash on base URL stripped before join).
- **Request body:** signed `control9.action-envelope.v0` JSON.
- **Request headers:** `Content-Type: application/json`, `Accept: application/json`, optional `Authorization: Bearer` when an API token is configured.
- **Normalized decision kinds:** `allow`, `deny`, `require_approval`, `observe`. SaaS may return `pending`; client handling depends on runtime mode (below).
- **Response fields** (when present): `decisionId`, `decisionKind`, `reason`, `correlationId`, optional `riskSummary`, `policyVersion`, `followUp`, `mayContinue`, `requiredAction`, `runtimeMode`. Snake_case aliases (`decision_id`, `decision_kind`, etc.) are accepted.
- **Retries:** bounded backoff on `408`, `429`, `500`, `502`, `503`, `504`. Malformed HTTP 200 responses fail the job in all modes.

### Pending handling

When SaaS returns `decisionKind: pending`:

- **Shadow mode:** Normalize to effective `observe`, continue the job, publish `correlationId` in summary/outputs for timeline correlation.
- **Enforce mode:** Fail the job closed on the first `pending` response; no in-job polling in MVP.

### Deploy verification

When `command` is `deploy-verification`, the client calls `POST {apiBaseUrl}/v1/deploy-verifications` with the same signed envelope. See `.ai/integration/api_contracts.md` for normalized verification statuses and workflow placement. MVP expects synchronous terminal verification statuses only.

The integration does not evaluate full policy packs locally and is not the durable system of record. Malformed configuration, invalid signatures, unsupported artifacts, and schema validation failures return actionable local errors. Transient network or server failures may retry with bounded backoff inside the CI job timeout.

## Technical Specification

The package is a Node-based GitHub Action with `runs.using: node20` and a GitLab runner entrypoint. `package.json` requires Node `>=20`, builds distributables with `@vercel/ncc`, uses TypeScript `5.8.x`, validates schemas with AJV `8.x`, and runs tests with Vitest `3.x`.

Policy client (`src/policy/client.ts`) and verification client (`src/verification/client.ts`) implement the canonical routes above. `keyId` is derived as SHA-256(signing secret).slice(0, 16) per `.ai/data/serialization.md`.

Envelope construction is remote-client oriented and mockable. Redaction happens before signing and submission. Secrets are supplied through CI masked variables, never persisted in generated artifacts.

## Testing Strategy

Testing should cover parsing supported IaC artifacts, normalizing action envelope content, redacting secrets, computing stable fingerprints, signing envelopes, mapping policy decisions (including `pending` in shadow mode), deploy verification normalization, and rendering workflow, PR, or merge request feedback. Fixture coverage should include terminal decisions, `pending` policy responses, malformed input, unsupported artifact versions, secrets requiring redaction, and verification outcomes.

Local verification uses `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build`. CI checks verify the generated `dist/` bundle matches source changes.

## References

- Peer: `control9/.ai/specs/ci-envelope-ingestion.spec.md` — canonical SaaS HTTP contract
- `.ai/business_logic/domain_model.md` — customer-edge role and remote policy decision ownership
- `.ai/integration/api_contracts.md` — deploy verification API, retry semantics, workflow placement
- `.ai/runtime/execution_model.md` — pending handling and blocking matrix
- `action.yml` — GitHub Action inputs, outputs, and Node 20 runtime
- `package.json` — Node engine, build, lint, typecheck, and test commands

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Client normalization
- Update `normalizePolicyDecision` to accept SaaS `pending` and project shadow-mode observe semantics per execution model.

### Configuration
- Document optional Bearer token input name and env mapping for GitHub and GitLab if defense-in-depth token is exposed to customers in MVP.
