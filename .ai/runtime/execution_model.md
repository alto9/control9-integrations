# Execution Model

This doc describes how the repo executes its main work at runtime.

## Contract

- The integration runs inside customer CI/CD runners without taking over execution.
- It starts in shadow mode for first installs and supports enforce mode when protected paths are configured.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan
- Define job step ordering, retry/backoff, timeout, cancellation, approval wait, and polling behavior.
- Describe behavior for rerun jobs, duplicate submissions, stale approval, and fingerprint mismatch.
