# API Contracts

This doc describes service boundaries and request or response responsibilities without exact endpoint names.

## Contract

- GitHub Actions is the first fully contracted provider; GitLab CI follows as the next expansion.
- The integration calls Control9 policy and deploy-verification APIs rather than evaluating full policy packs locally.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan
- Define install inputs, token/secret setup, API base URL behavior, retries, timeouts, and response handling.
- Describe deploy verification call placement for pre-apply, pre-deploy, and post-run evidence.
