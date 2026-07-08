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
- **Request headers:** `Content-Type: application/json`, `Accept: application/json`. The lower-level clients may attach `Authorization: Bearer <token>` when a programmatic caller supplies an API token, but the MVP GitHub Action and GitLab component expose no customer-facing Bearer token input.
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

Policy decision normalization accepts SaaS `pending` responses from policy submission as an incoming API state, not as a terminal client decision kind. Runtime handling projects `pending` to effective `observe` in shadow mode, preserves the SaaS `correlationId` in summary/output data, and fails closed in enforce mode without in-job polling.

Customer-facing configuration uses `signing-secret` as the required HMAC signing material. MVP does not expose a GitHub Action input, GitLab component input, or `INPUT_*` environment mapping for a separate Control9 API Bearer token; any Bearer header is limited to lower-level client adapters that explicitly provide `apiToken`.

Envelope construction is remote-client oriented and mockable. Redaction happens before signing and submission. Secrets are supplied through CI masked variables, never persisted in generated artifacts.

## Testing Strategy

Testing should cover parsing supported IaC artifacts, normalizing action envelope content, redacting secrets, computing stable fingerprints, signing envelopes, mapping policy decisions (including `pending` in shadow mode and enforce-mode fail-closed handling), deploy verification normalization, and rendering workflow, PR, or merge request feedback. Fixture coverage should include terminal decisions, `pending` policy responses, malformed input, unsupported artifact versions, secrets requiring redaction, and verification outcomes.

HTTP contract fixtures for client response parsing live in reusable JSON files under `fixtures/policy/` and `fixtures/verification/`, then drive Vitest coverage for `src/policy/client.ts` and `src/verification/client.ts`. Policy fixtures cover flat SaaS policy responses for `allow`, `deny`, `require_approval`, `observe`, and `pending`, malformed HTTP 200 payloads, retry exhaustion or retryable HTTP status cases, and accepted top-level snake_case aliases for documented response fields. Deploy verification fixtures cover `verified`, `fingerprint_mismatch`, `no_approved_baseline`, malformed HTTP 200 payloads, retry exhaustion or retryable HTTP status cases, and accepted top-level snake_case aliases for documented verification response fields.

Fixture JSON mirrors the flat CI-facing HTTP shapes from the peer `control9/.ai/specs/ci-envelope-ingestion.spec.md` contract. Fixtures must not include internal SaaS wrapper or persistence fields such as `ok`, `accepted`, `isReplay`, `enqueuedClassification`, `data`, `skeleton`, `outcome`, `approvedFingerprint`, or `failureReasonCode`. Local client tests remain mock-backed with no live Control9 dependency; later deployed-stage validation may reuse the same fixture vectors after the canonical SaaS routes and flat response projection are deployed.

Local verification uses `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build`. CI checks verify the generated `dist/` bundle matches source changes.

## References

- Peer: `control9/.ai/specs/ci-envelope-ingestion.spec.md` — canonical SaaS HTTP contract
- `.ai/business_logic/domain_model.md` — customer-edge role and remote policy decision ownership
- `.ai/integration/api_contracts.md` — deploy verification API, retry semantics, workflow placement
- `.ai/runtime/execution_model.md` — pending handling and blocking matrix
- `action.yml` — GitHub Action inputs, outputs, and Node 20 runtime
- `package.json` — Node engine, build, lint, typecheck, and test commands

## Open implementation decisions

None for policy envelope submission contract alignment.
