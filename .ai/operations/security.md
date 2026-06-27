# Security

This doc describes security, privacy, and trust requirements that apply across implementation choices.

## Contract

- The repo is open source because customer-installed pipeline code benefits from public reviewability.
- Release artifacts support pinning, provenance, changelog review, and auditability.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan
- Specify secret handling, log redaction tests, and safe defaults for debug mode.
