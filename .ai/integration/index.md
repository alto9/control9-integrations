# Integration

External service, API, authorization, and asynchronous boundary contracts.

## Repo role

Public customer-edge install surface for Control9. It owns the GitHub Action and GitLab CI component/template that redact and sign envelopes, call the SaaS, and render decisions in CI/CD.

## Contract stance

- GitHub Actions is the first fully contracted provider; GitLab CI follows as the next expansion.
- The integration calls Control9 policy and deploy-verification APIs rather than evaluating full policy packs locally.
- Terraform/OpenTofu plan output and CDK/CloudFormation synth or diff artifacts are first-class inputs.
- GitHub checks, PR comments, workflow summaries, GitLab job status, and MR comments are expected feedback surfaces.

## Initiative constraints

- GitHub Actions is the first fully contracted implementation path; GitLab CI is the next expansion.
- The integration stays small and does not become a local policy engine.
- Enforce mode fails closed for protected targets when the Control9 API is unavailable, while explicitly configured shadow or non-production paths may fail open.

## Mapped child docs

- `integration/api_contracts.md` - API Contracts
- `integration/hosted_ai_inference.md` - Hosted AI Inference
- `integration/external_systems.md` - External Systems
- `integration/messaging_async.md` - Messaging And Async
- `integration/authorization.md` - Authorization
