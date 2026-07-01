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

When the policy client cannot produce a normalized decision:

| Condition | Retries | Rendered outcome | Shadow mode | Enforce mode |
|-----------|---------|------------------|-------------|--------------|
| Transient network or retryable HTTP status (`408`, `429`, `500`, `502`, `503`, `504`) | Bounded with exponential backoff | `unavailable_api` after exhaustion | Job continues (fail open) | Job fails (fail closed) |
| Request timeout before a response is received | Same retry policy when detectable; otherwise classify as `unavailable_api` | `unavailable_api` or `timeout` | Job continues | Job fails |
| HTTP 200 with missing or invalid decision fields | None | `malformed_response` | Job fails | Job fails |
| Non-retryable HTTP status (for example `400`, `401`, `403`, `404`) | None | `unavailable_api` with status detail | Job continues | Job fails |

Malformed responses always fail the job in both modes because the action cannot publish a trustworthy governance decision.

Configurable fail-open behavior for non-production or explicitly exempt targets beyond the shadow/enforce input is defined in enforce-mode configuration work; the baseline matrix above applies to the `mode` input alone.

## Local pre-submit failures

These occur before envelope submission and remain immediate action errors without outcome rendering:

- Unsupported command or artifact shape for the selected IaC tool.
- Unreadable artifact paths.
- Envelope schema, signing, or redaction failures.
- Invalid action inputs.

Unsupported repository configuration that prevents trustworthy evidence collection is a local action error with an actionable message. It is not retried against the policy API.
