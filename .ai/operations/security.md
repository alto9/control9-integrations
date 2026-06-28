# Security

This doc describes security, privacy, and trust requirements that apply across implementation choices.

## Contract

- The repo is open source because customer-installed pipeline code benefits from public reviewability.
- Release artifacts support pinning, provenance, changelog review, and auditability.
- Signing material and API tokens are provided through CI secrets and are never logged, echoed into summaries, included in action outputs, or serialized into envelopes.
- Redaction runs before envelope signing and submission. Tests must prove that raw secrets, private keys, token-like values, environment variable values, and sensitive command output do not leave the runner in default mode.
- Debug output is safe by default: it may expose validation decisions, counts, fingerprints, and redaction markers, but it must not expose raw values that were removed from payloads.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.
