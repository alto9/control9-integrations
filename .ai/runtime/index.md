# Runtime

Startup, configuration, execution, and lifecycle contracts.

## Repo role

Public customer-edge install surface for Control9. It owns the GitHub Action and GitLab CI component/template that redact and sign envelopes, call the SaaS, and render decisions in CI/CD.

## Contract stance

- The integration runs inside customer CI/CD runners without taking over execution.
- It starts in shadow mode for first installs and supports enforce mode when protected paths are configured.
- Deploy verification is a distinct call before deploy authority is used.
- Protected enforce targets fail closed when the Control9 API is unavailable; explicitly configured shadow or non-production paths may fail open.

## Initiative constraints

- GitHub Actions is the first fully contracted implementation path; GitLab CI is the next expansion.
- The integration stays small and does not become a local policy engine.
- Enforce mode fails closed for protected targets when the Control9 API is unavailable, while explicitly configured shadow or non-production paths may fail open.

## Mapped child docs

- `runtime/configuration.md` - Configuration
- `runtime/startup_bootstrap.md` - Startup Bootstrap
- `runtime/lifecycle_shutdown.md` - Lifecycle And Shutdown
- `runtime/execution_model.md` - Execution Model
