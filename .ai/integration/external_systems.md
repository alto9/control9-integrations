# External Systems

This doc describes external systems and the direction of responsibility at each boundary.

## Contract

- GitHub Actions is the first fully contracted provider; GitLab CI follows as the next expansion.
- The integration calls Control9 policy and deploy-verification APIs rather than evaluating full policy packs locally.
- The GitHub Action interface accepts mode, API base URL, tenant or installation identity, signing secret or token, target environment, requested authority, IaC tool selection, artifact paths, working directory, and optional redaction settings as inputs or environment-provided secrets.
- The first action produces structured outputs for envelope id, artifact fingerprint, decision id, decision kind, and summary path so later workflow summary, check, and pull request rendering can consume results without re-parsing raw artifacts.
- GitLab CI uses the same conceptual envelope and API boundary later, but GitLab-specific inputs, job status behavior, and merge request comments are not part of the first GitHub shadow-mode implementation.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.
