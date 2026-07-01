# Error Handling

This doc describes how the domain responds when a product-level state cannot continue normally.

## Contract

- The integration is a customer-edge enforcement and reporting point, not the durable system of record.
- It gathers supported IaC and deploy context, redacts locally, signs an envelope, requests a SaaS decision, and renders the result where developers already work.
- Policy outcomes are classified into a small deterministic set before workflow feedback is published. The action never guesses a decision kind when the policy API response is incomplete or untrustworthy.

## Policy decision outcomes

After a successful envelope submission and response normalization, the action handles four policy kinds:

| Decision kind | Shadow mode | Enforce mode |
|---------------|-------------|--------------|
| `allow` | Job continues; summary and annotations report approval. | Job continues. |
| `observe` | Job continues; advisory summary states the finding is non-blocking. | Job continues; advisory summary states the finding is non-blocking. |
| `deny` | Job continues; summary states shadow mode and that Control9 did not block the workflow. | Job fails; workflow is blocked. |
| `require_approval` | Job continues; summary states shadow mode and that the workflow is not waiting for approval. | Job fails immediately; workflow is blocked and follow-up guidance (for example an approval URL) is rendered when the API supplies it. Approval polling and wait loops are handled separately in async/messaging contracts. |

## Policy API failure outcomes

When the policy client cannot produce a normalized decision, blocking follows the fail-open path vs protected enforce target matrix in the next section. Shadow mode is always a fail-open path. Enforce mode on a listed `fail-open-environments` target behaves like shadow for API unavailability only.

## Fail-open paths and protected enforce targets

Blocking for API transport failures depends on whether the run is on a **fail-open path** or a **protected enforce target**:

| Path class | Definition |
|------------|------------|
| Fail-open path | `mode` is `shadow`, or `mode` is `enforce` and the current `target-environment` is listed in optional `fail-open-environments` |
| Protected enforce target | `mode` is `enforce` and the current `target-environment` is not listed in `fail-open-environments` (including when the list is empty or omitted) |

When the policy or deploy verification client cannot produce a normalized outcome, apply this blocking matrix:

| Condition | Retries | Rendered outcome | Fail-open path | Protected enforce target |
|-----------|---------|------------------|----------------|--------------------------|
| Transient network or retryable HTTP status (`408`, `429`, `500`, `502`, `503`, `504`) | Bounded with exponential backoff | `unavailable_api` after exhaustion | Job continues | Job fails |
| Request timeout before a response is received | Same retry policy when detectable; otherwise classify as `unavailable_api` | `unavailable_api` or `timeout` | Job continues | Job fails |
| HTTP 200 with missing or invalid decision or verification fields | None | `malformed_response` | Job fails | Job fails |
| Non-retryable HTTP status (for example `400`, `401`, `403`, `404`) | None | `unavailable_api` with status detail | Job continues | Job fails |

Fail-open configuration does not relax enforce-mode blocking for normalized policy outcomes (`deny`, `require_approval`) or deploy verification mismatch outcomes (`fingerprint_mismatch`, `no_approved_baseline`). Those remain governed by the policy decision and deploy verification tables above.

## Local pre-submit failures

These occur before envelope submission and remain immediate action errors without outcome rendering:

- Unsupported command or artifact shape for the selected IaC tool.
- Unreadable artifact paths.
- Envelope schema, signing, or redaction failures.
- Invalid action inputs.

Unsupported repository configuration that prevents trustworthy evidence collection is a local action error with an actionable message. It is not retried against the policy API.

## Deploy verification outcomes

When `command` is `deploy-verification`, outcomes come from the verification API rather than policy decision kinds:

| Verification status | Shadow mode | Enforce mode |
|---------------------|-------------|--------------|
| `verified` | Job continues | Job continues |
| `fingerprint_mismatch` | Job continues (advisory) | Job fails |
| `no_approved_baseline` | Job continues (advisory) | Job fails |

Verification API transport and malformed-response handling uses the same fail-open path vs protected enforce target matrix as policy API failures. Rendered feedback uses deploy verification presentation headings documented in `interface/presentation.md`.
