# Data

Product data ownership, persistence, serialization, and consistency contracts.

## Repo role

Public customer-edge install surface for Control9. It owns the GitHub Action and GitLab CI component/template that redact and sign envelopes, call the SaaS, and render decisions in CI/CD.

## Contract stance

- Integration data is transient customer-edge data: local configuration, summaries, fingerprints, signatures, envelopes, and rendered decision output.
- Action envelopes include actor, repo, branch, tool, target, environment, intent, diff summary, requested authority, and artifact fingerprints at a product level.
- Redaction happens before data leaves the customer boundary.
- Full source code and full command output are not captured by default.

## Initiative constraints

- GitHub Actions is the first fully contracted implementation path; GitLab CI is the next expansion.
- The integration stays small and does not become a local policy engine.
- Enforce mode fails closed for protected targets when the Control9 API is unavailable, while explicitly configured shadow or non-production paths may fail open.

## Mapped child docs

- `data/data_model.md` - Data Model
- `data/persistence_abstractions.md` - Persistence Abstractions
- `data/serialization.md` - Serialization
- `data/consistency.md` - Consistency
