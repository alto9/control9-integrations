# Operations

Build, deployment, observability, and security contracts.

## Repo role

Public customer-edge install surface for Control9. It owns the GitHub Action and GitLab CI component/template that redact and sign envelopes, call the SaaS, and render decisions in CI/CD.

## Contract stance

- The repo is open source because customer-installed pipeline code benefits from public reviewability.
- Release artifacts support pinning, provenance, changelog review, and auditability.
- The integration avoids logging tokens, private keys, environment values, and full command output by default.
- Support boundaries cover GitHub-hosted runners, self-hosted runners, GitLab SaaS, and GitLab self-managed at the contract level.

## Initiative constraints

- GitHub Actions is the first fully contracted implementation path; GitLab CI is the next expansion.
- The integration stays small and does not become a local policy engine.
- Enforce mode fails closed for protected targets when the Control9 API is unavailable, while explicitly configured shadow or non-production paths may fail open.

## Mapped child docs

- `operations/build_packaging.md` - Build And Packaging
- `operations/deployment_environments.md` - Deployment Environments
- `operations/observability.md` - Observability
- `operations/security.md` - Security
