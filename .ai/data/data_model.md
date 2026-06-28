# Data Model

This doc describes durable and transient data concepts without freezing physical table or field names.

## Contract

- Integration data is transient customer-edge data: local configuration, summaries, fingerprints, signatures, envelopes, and rendered decision output.
- Action envelopes include actor, repo, branch, tool, target, environment, intent, diff summary, requested authority, and artifact fingerprints at a product level.
- Each envelope carries a stable schema version, provider context, run identity, tenant or installation identity, repository identity, ref or pull request identity, actor identity, command category, IaC tool, environment, requested authority, normalized change summary, redaction report, artifact fingerprints, and signature metadata.
- Terraform/OpenTofu envelopes summarize `terraform show -json` plan data into resource action counts, resource addresses or identifiers needed for policy evidence, provider hints, target workspace or directory, and a plan fingerprint. CDK/CloudFormation envelopes summarize synthesized templates or diffs into stack names, account or region hints when available, resource action counts, IAM and networking-sensitive changes when detectable, and template or diff fingerprints.
- Redacted values remain represented by explicit markers that preserve field presence, value class, and count without exposing raw secrets. Fingerprints cover the normalized artifact content after deterministic ordering and before signature generation.
- Monorepos, multiple environments, and multiple cloud accounts are represented inside the envelope as explicit target descriptors, not by overloading repository or branch fields.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.
