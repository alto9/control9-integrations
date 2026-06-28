# Execution Model

This doc describes how the repo executes its main work at runtime.

## Contract

- The integration runs inside customer CI/CD runners without taking over execution.
- It starts in shadow mode for first installs and supports enforce mode when protected paths are configured.
- For the first GitHub shadow-mode path, customer workflows generate plan, synth, or diff artifacts before invoking the Control9 action. The action reads those artifacts, builds and signs the envelope, submits it to Control9, and returns structured decision data without blocking deployment solely because the returned decision is observational.
- Envelope submission is idempotent from the client perspective by including stable run identity and artifact fingerprint data. Rerun jobs may submit the same normalized evidence again, and the control plane is responsible for durable de-duplication.
- Unsupported artifacts, invalid configuration, schema failures, signing failures, and redaction failures are local action errors because the action cannot produce trustworthy governance evidence from them.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan
- Define enforce-mode approval wait, polling behavior, stale approval handling, and fingerprint mismatch behavior.
