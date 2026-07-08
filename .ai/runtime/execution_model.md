# Execution Model

This doc describes how the repo executes its main work at runtime.

## Contract

- The integration runs inside customer CI/CD runners without taking over execution.
- Public runtime input vocabulary is `shadow` and `enforce`. `shadow` is the default first-install mode and covers shadow, observe, and dry-run semantics. `enforce` covers blocking and approval-required semantics when protected paths are configured.
- Customer workflows generate plan, synth, or diff artifacts before invoking Control9. The integration reads those artifacts, builds and signs the envelope with provider workflow context, submits it to `POST {apiBaseUrl}/v1/action-envelopes`, and returns structured decision data. Shadow mode does not block solely because the returned decision is observational.
- GitLab CI jobs follow the same sequence through the GitLab runner entrypoint. After classification, the GitLab presentation path publishes collapsible job log sections, advisory/warning log prefixes, and optional merge request notes per `interface/presentation.md`, then applies blocking via non-zero job exit when required.
- Envelope submission is idempotent from the client perspective by including stable run identity and artifact fingerprint data. Rerun jobs may submit the same normalized evidence again, and the control plane is responsible for durable de-duplication.
- Unsupported artifacts, invalid configuration, schema failures, signing failures, and redaction failures are local action errors because the action cannot produce trustworthy governance evidence from them.
- After envelope submission, the action classifies the result into a terminal policy decision kind (`allow`, `deny`, `require_approval`, `observe`) or a documented API failure outcome (`unavailable_api`, `timeout`, `malformed_response`) before publishing workflow feedback. SaaS `pending` is an incoming API state, not a terminal client decision kind. Blocking behavior follows the matrix in `business_logic/error_handling.md` using the configured `mode`, `target-environment`, and optional `fail-open-environments` list.
- In enforce mode, `deny` and `require_approval` decisions fail the job immediately after feedback is published. The action does not poll for approval in this milestone; it renders follow-up guidance when the API provides it.
- When SaaS returns `decisionKind: pending` on policy submission, shadow mode normalizes to effective `observe`, continues the job, and publishes the SaaS `correlationId` in summary/output data for timeline correlation. Enforce mode fails the job on the first `pending` response after workflow feedback is published, without in-job polling or approval waiting.
- When `command` is `deploy-verification`, the action builds and signs the envelope, calls `POST {apiBaseUrl}/v1/deploy-verifications` rather than the policy decision API, classifies the verification status, publishes deploy-verification workflow feedback, and applies blocking rules below.

## Deploy verification execution

After a successful verification API response:

| Verification status | Shadow mode | Enforce mode |
|---------------------|-------------|--------------|
| `verified` | Job continues; summary states fingerprint match | Job continues |
| `fingerprint_mismatch` | Job continues; advisory `fingerprint_mismatch` feedback | Job fails; workflow blocked |
| `no_approved_baseline` | Job continues; advisory feedback with `no_approved_baseline` wording | Job fails; workflow blocked |

Verification API transport failures follow the same retry and fail-open vs protected enforce target matrix as policy API failures (`unavailable_api`, `timeout`, `malformed_response`). Malformed verification responses always fail the job.

## Future scope

Explicit long-lived approval waits, polling behavior, and stale approval handling belong to future approval workflow work. SaaS `pending` policy responses are not approval waits in the MVP CI client.
