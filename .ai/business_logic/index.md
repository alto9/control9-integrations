# Business Logic

Domain behavior and rules that should remain true regardless of UI, deployment, or implementation layout.

## Repo role

Public customer-edge install surface for Control9. It owns the GitHub Action and GitLab CI component/template that redact and sign envelopes, call the SaaS, and render decisions in CI/CD.

## Contract stance

- The integration is a customer-edge enforcement and reporting point, not the durable system of record.
- It gathers supported IaC and deploy context, redacts locally, signs an envelope, requests a SaaS decision, and renders the result where developers already work.
- Shadow mode is the first install path and never blocks deploys.
- Enforce mode blocks, waits, or proceeds according to the SaaS decision and deploy-verification result.

## Initiative constraints

- GitHub Actions is the first fully contracted implementation path; GitLab CI is the next expansion.
- The integration stays small and does not become a local policy engine.
- Enforce mode fails closed for protected targets when the Control9 API is unavailable, while explicitly configured shadow or non-production paths may fail open.

## Mapped child docs

- `business_logic/domain_model.md` - Domain Model
- `business_logic/user_stories.md` - User Stories
- `business_logic/error_state.md` - Error States
- `business_logic/error_handling.md` - Error Handling
