# Configuration

This doc describes configuration classes and safe defaults for the GitHub Action customer edge.

## Contract

- The integration runs inside customer CI/CD runners without taking over execution.
- First installs default to shadow mode. Enforce mode is selected explicitly when protected deploy paths are configured.
- Configuration is supplied through GitHub Action inputs and secrets. There is no separate on-disk config file for the first GitHub Action path.

## Configuration classes

### Runtime mode

- `shadow` (default): submit signed envelopes, render observe or other decisions, and never block the workflow on policy outcomes.
- `enforce`: block, wait, or fail the workflow when the normalized decision requires it.

### Control plane identity

- Control9 API base URL (required): absolute `http` or `https` URL, trailing slash stripped at parse time.
- Tenant or installation identity (required): stable tenant key supplied by Control9 onboarding.
- Signing secret (required, secret input): HMAC signing material for envelope submission. Never logged or echoed.

### Fail-open environment overrides

- Fail-open environments (optional): comma-separated list of `target-environment` keys that may continue the workflow when the Control9 API is unavailable, even if `mode` is `enforce`. Values are trimmed and lowercased at parse time. Omitted or empty means every enforce run is treated as a protected enforce target for API failure purposes.
- Typical use: list non-production environment keys such as `staging` or `dev` so enforce-mode staging workflows report API outages without blocking deploys, while production enforce steps remain fail-closed.

### Governed change context

- Target environment (required): governed environment key such as `staging` or `production`.
- Requested authority (required): deploy or change authority requested by the workflow step, such as `plan` or `apply`.
- IaC tool (required): `terraform`, `opentofu`, `cdk`, or `cloudformation`.
- Command category (required): `plan`, `synth`, `diff`, or `deploy-verification`. The `deploy-verification` value selects the deploy verification API path documented in `integration/api_contracts.md` instead of policy envelope submission.
- Artifact paths (required): comma-separated repository-relative paths to plan JSON, synthesized templates, or diff artifacts.
- Working directory (default `.`): repository-relative base for artifact path resolution.

### Redaction

- Redaction profile (optional, default `standard`): names the active redaction rule set applied before signing.
- Redaction additional patterns (optional): comma-separated extra regular expressions merged after the standard profile patterns.

### Local output

- Summary JSON is written under `RUNNER_TEMP` when present, otherwise `.control9/output/control9-summary.json` relative to the process working directory.
- Summary files contain decision metadata, fingerprints, and redaction counts. They do not contain signing secrets or raw redacted values.

## Safe defaults summary

| Setting | Default when omitted | Notes |
|---------|---------------------|-------|
| Runtime mode | `shadow` | First-install safe path |
| Fail-open environments | (empty) | All enforce runs fail closed on API unavailability |
| Working directory | `.` | Artifact paths resolve from repo root |
| Redaction profile | `standard` | Built-in secret and token patterns |
| Evidence capture | summary-only | No opt-in full-output input in shadow-mode milestone |
| Signing algorithm | `hmac-sha256` | Fixed; not customer-configurable |

Missing required inputs, invalid URLs, unsupported tool or command values, unreadable artifact paths, or redaction failures fail locally before envelope submission.
