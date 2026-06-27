# Messaging And Async

This doc describes asynchronous delivery, replay, notification, retry, and webhook expectations at a product level.

## Contract

- GitHub Actions is the first fully contracted provider; GitLab CI follows as the next expansion.
- The integration calls Control9 policy and deploy-verification APIs rather than evaluating full policy packs locally.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan
- Define how approval-required state blocks or waits in GitHub and GitLab.
