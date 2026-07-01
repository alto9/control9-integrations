# Input Handling

This doc describes user or operator inputs and validation expectations at a product level.

## Contract

- Developers see concise risk explanations in workflow summaries, checks, comments, job output, and merge request feedback.
- Allow, deny, require approval, and observe results remain distinguishable by label, title, and summary text.
- Outcome messages avoid leaking raw secrets, tokens, private keys, full plan payloads, or unredacted envelope content.

## Outcome message templates

Each rendered outcome uses a stable label, title, summary, and detail lines. Policy decision templates incorporate API-supplied reason text and optional risk summary, policy version, decision id, artifact fingerprint, target environment, redaction status, and safe follow-up action text.

| Outcome kind | Label | Title (summary heading) | Summary intent |
|--------------|-------|-------------------------|----------------|
| `allow` | Decision: Allow | Control9 allowed this change | Policy reason text |
| `deny` | Decision: Deny | Control9 denied this change | Policy reason; in shadow mode append that the workflow was not blocked |
| `require_approval` | Decision: Approval Required | Control9 requires approval for this change | Policy reason; in shadow mode append that the workflow is not waiting |
| `observe` | Decision: Observe (Advisory) | Control9 advisory finding | Policy reason plus explicit non-blocking advisory wording |
| `timeout` | Outcome: Policy API Timeout | Control9 policy request timed out | Instruct operator to review logs and service status before rerun; when on a fail-open path, append that the workflow continued because this environment is configured to fail open on API unavailability |
| `unavailable_api` | Outcome: Policy API Unavailable | Control9 policy API is unavailable | Instruct operator to review network, endpoint, and service status after bounded retries; when on a fail-open path, append that the workflow continued because this environment is configured to fail open on API unavailability |
| `malformed_response` | Outcome: Malformed Policy Response | Control9 received an invalid policy response | State that the response could not be normalized and name the missing or invalid field class without echoing raw payload |
| `redaction_applied` | Outcome: Redaction Applied | Control9 redaction was applied before submission | Report redaction counts and profile (pre-submit informational outcome) |
| `fingerprint_mismatch` | Outcome: Fingerprint Mismatch | Control9 detected an artifact fingerprint mismatch | Compare expected vs actual fingerprint for deploy verification flows |
| `verified` (deploy verification) | Outcome: Deploy Verified | Control9 verified the deploy artifact | State that the current fingerprint matches the approved fingerprint on record |
| `no_approved_baseline` (deploy verification) | Outcome: No Approved Baseline | Control9 found no approved fingerprint for this change | State that deploy authority requires a prior approved plan or template fingerprint |

Deploy verification API failure outcomes reuse the `timeout`, `unavailable_api`, and `malformed_response` templates with deploy verification presentation headings.

Follow-up metadata from the policy API is limited to safe string fields (for example `approval_url` or `action`). Structured or unknown follow-up fields are not copied into rendered output.

Annotation messages use the form `{label} — {summary}` for workflow log annotations.
