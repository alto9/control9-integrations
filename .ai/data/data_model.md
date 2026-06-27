# Data Model

This doc describes durable and transient data concepts without freezing physical table or field names.

## Contract

- Integration data is transient customer-edge data: local configuration, summaries, fingerprints, signatures, envelopes, and rendered decision output.
- Action envelopes include actor, repo, branch, tool, target, environment, intent, diff summary, requested authority, and artifact fingerprints at a product level.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan
- Define envelope fields, redaction markers, signature coverage, fingerprint inputs, and schema examples.
- Describe how monorepos, multiple environments, and multiple cloud accounts are represented.
