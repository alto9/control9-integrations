# Messaging And Async

This doc describes asynchronous delivery, replay, notification, retry, and webhook expectations at a product level.

## Contract

- GitHub Actions is the first fully contracted provider; GitLab CI follows as the next expansion.
- The integration calls Control9 policy and deploy-verification APIs rather than evaluating full policy packs locally.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan
- Define how explicit approval-required workflows block or wait in GitHub and GitLab. SaaS `pending` policy responses are not asynchronous wait states for the CI client in the MVP; shadow mode records the correlation id and continues, while enforce mode fails closed without polling.
