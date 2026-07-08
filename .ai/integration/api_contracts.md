# API Contracts

This doc describes service boundaries and request or response responsibilities without exact endpoint names.

## Contract

- GitHub Actions is the first fully contracted provider; GitLab CI follows as the next expansion.
- The integration calls Control9 policy and deploy-verification APIs rather than evaluating full policy packs locally.
- The first GitHub Action requires a Control9 API base URL, tenant or installation identity, and signing secret or token supplied through GitHub Actions inputs and secrets. Shadow mode is the default first-install mode.
- The action submits one signed, redacted action envelope per evaluated command or artifact group to the Control9 policy decision boundary. The client treats the API as remote and mockable, with deterministic request construction and fixture coverage.
- Client retries are bounded and safe for CI: transient network and server failures may retry with backoff inside the job timeout, while malformed configuration, invalid signatures, unsupported artifacts, and schema validation failures return actionable local errors.
- Policy responses are normalized into `allow`, `deny`, `require_approval`, or `observe` with reason text, optional risk summary, policy version, decision id, and follow-up metadata for later rendering by workflow feedback code. SaaS may return `pending`; shadow mode treats it as non-blocking observe with `correlationId` logged; enforce mode fails closed.

## Policy envelope submission API

When the `command` input is not `deploy-verification`, the client calls the policy evaluation boundary.

- **Endpoint:** `POST {apiBaseUrl}/v1/action-envelopes` (trailing slash on base URL stripped before join).
- **Request body:** the signed action envelope (`control9.action-envelope.v0`) built from the current artifact and provider workflow context.
- **Request headers:** `Content-Type: application/json`, `Accept: application/json`. Lower-level clients may attach `Authorization: Bearer <token>` when `apiToken` is supplied by a programmatic caller, but MVP provider configuration does not expose a customer-facing Bearer token input.
- **Normalized decision kinds:** `allow`, `deny`, `require_approval`, `observe`. When SaaS returns `pending`, shadow mode normalizes to effective observe and continues; enforce mode fails the job.
- **Response fields** (when present): `decisionId`, `decisionKind`, `reason`, `correlationId`, optional `riskSummary`, `policyVersion`, `followUp`, `mayContinue`, `requiredAction`, `runtimeMode`. Snake_case aliases accepted.
- **Retries:** same bounded retry policy and retryable HTTP status set as deploy verification (`408`, `429`, `500`, `502`, `503`, `504`). Malformed HTTP 200 responses fail the job in all modes.
- **Client testing:** treat the API as remote and mockable with fixture JSON; no live Control9 dependency in unit or integration tests.

The authoritative SaaS HTTP contract (auth, errors, idempotency) is `control9/.ai/specs/ci-envelope-ingestion.spec.md`.

## Deploy verification API

When the GitHub Action `command` input is `deploy-verification`, the client calls the deploy verification boundary instead of the policy decision boundary.

- **Endpoint:** `POST {apiBaseUrl}/v1/deploy-verifications` (trailing slash on base URL stripped before join).
- **Request body:** the signed action envelope (`control9.action-envelope.v0`) built from the current artifact. The envelope carries tenant, repository, ref or pull request, environment, requested authority, artifact fingerprints, and correlation identity. The control plane resolves the approved fingerprint from that context; callers do not pass a separate approval id input in this milestone.
- **Normalized verification statuses:**
  - `verified` — current artifact fingerprint matches the approved fingerprint on record.
  - `fingerprint_mismatch` — a baseline exists but the current fingerprint differs; response includes `expectedFingerprint` and `actualFingerprint`.
  - `no_approved_baseline` — no approved fingerprint exists for this governed change context; response includes human-readable `reason` text.
- **Response fields** (when present): `verificationId`, optional linked `decisionId`, `expectedFingerprint`, `actualFingerprint`, and `reason`.
- **Retries:** same bounded retry policy and retryable HTTP status set as policy envelope submission (`408`, `429`, `500`, `502`, `503`, `504`). Malformed HTTP 200 responses fail the job in all modes.
- **Client testing:** treat the API as remote and mockable with fixture JSON; no live Control9 dependency in unit or integration tests.

## Workflow call placement

Customer workflows invoke deploy verification as a **separate action step immediately before protected deploy authority** is used:

| IaC tool | Workflow moment | Typical `requested-authority` | Artifact |
|----------|-----------------|--------------------------------|----------|
| Terraform / OpenTofu | After plan generation, before `apply` or production role assumption | `apply` | Single plan JSON (`terraform show -json` or equivalent) |
| CDK | After synth/diff, before `cdk deploy` | `deploy` | Synthesized template JSON or plan artifact used for the deploy |
| CloudFormation | After change set or template prep, before stack update | `deploy` | Template JSON or plan artifact used for the update |

**Post-run evidence:** the control plane may record deploy outcomes asynchronously for timeline search. This integrations milestone does not add a blocking post-deploy verification client call; only pre-apply and pre-deploy steps above are in scope.
