# API Contracts

This doc describes service boundaries and request or response responsibilities without exact endpoint names.

## Contract

- GitHub Actions is the first fully contracted provider; GitLab CI follows as the next expansion.
- The integration calls Control9 policy and deploy-verification APIs rather than evaluating full policy packs locally.
- The first GitHub Action requires a Control9 API base URL, tenant or installation identity, and signing secret or token supplied through GitHub Actions inputs and secrets. Shadow mode is the default first-install mode.
- The action submits one signed, redacted action envelope per evaluated command or artifact group to the Control9 policy decision boundary. The client treats the API as remote and mockable, with deterministic request construction and fixture coverage.
- Client retries are bounded and safe for CI: transient network and server failures may retry with backoff inside the job timeout, while malformed configuration, invalid signatures, unsupported artifacts, and schema validation failures return actionable local errors.
- Policy responses are normalized into `allow`, `deny`, `require_approval`, or `observe` with reason text, optional risk summary, policy version, decision id, and follow-up metadata for later rendering by workflow feedback code.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan
- Describe deploy verification call placement for pre-apply, pre-deploy, and post-run evidence.
