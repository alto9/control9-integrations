# Build And Packaging

This doc describes how artifacts are produced, versioned, reviewed, or packaged.

## Contract

- The repo is open source because customer-installed pipeline code benefits from public reviewability.
- Release artifacts support pinning, provenance, changelog review, and auditability.
- The first GitHub Action implementation uses TypeScript and ships with committed action metadata, build output suitable for GitHub Actions consumption, unit tests, parser fixtures, schema fixtures, linting, and a reproducible build script.
- Action releases are tag-pinnable. Customers can pin a major version or an exact tag, while security-sensitive adopters can review source, generated action output, dependency updates, and changelog entries before upgrading.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan
- Define long-term changelog, provenance attestation, dependency update cadence, and vulnerability response expectations.
