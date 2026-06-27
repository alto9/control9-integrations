# Serialization

This doc describes boundary shapes, redaction expectations, fingerprints, summaries, and exported representations at a product level.

## Contract

- Integration data is transient customer-edge data: local configuration, summaries, fingerprints, signatures, envelopes, and rendered decision output.
- Action envelopes include actor, repo, branch, tool, target, environment, intent, diff summary, requested authority, and artifact fingerprints at a product level.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan
- Specify local config shape, default include/exclude rules, and opt-in full-output capture controls.
