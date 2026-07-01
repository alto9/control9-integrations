# Configuration

This doc describes configuration classes and safe defaults for the GitHub Action and GitLab CI customer edge.

## Contract

- The integration runs inside customer CI/CD runners without taking over execution.
- First installs default to shadow mode. Enforce mode is selected explicitly when protected deploy paths are configured.
- Configuration is supplied through provider-native inputs and secrets. There is no separate on-disk config file.
- GitHub Action inputs and GitLab CI component `spec:inputs` expose the same logical configuration surface documented below.

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

## GitLab CI mapping

GitLab pipelines configure the component through `include:inputs` (remote include or catalog). Secret values use masked/protected CI/CD variables referenced from the component template.

| Logical setting | GitLab component input | Environment variable |
|-----------------|------------------------|----------------------|
| Runtime mode | `mode` | `INPUT_MODE` |
| API base URL | `control9-api-url` | `INPUT_CONTROL9_API_URL` |
| Tenant identity | `tenant-id` | `INPUT_TENANT_ID` |
| Signing secret | `signing-secret` (masked variable) | `INPUT_SIGNING_SECRET` |
| Target environment | `target-environment` | `INPUT_TARGET_ENVIRONMENT` |
| Requested authority | `requested-authority` | `INPUT_REQUESTED_AUTHORITY` |
| IaC tool | `iac-tool` | `INPUT_IAC_TOOL` |
| Command category | `command` | `INPUT_COMMAND` |
| Artifact paths | `artifact-paths` | `INPUT_ARTIFACT_PATHS` |
| Working directory | `working-directory` | `INPUT_WORKING_DIRECTORY` |
| Redaction profile | `redaction-profile` | `INPUT_REDACTION_PROFILE` |
| Extra redaction patterns | `redaction-additional-patterns` | `INPUT_REDACTION_ADDITIONAL_PATTERNS` |
| Fail-open environments | `fail-open-environments` | `INPUT_FAIL_OPEN_ENVIRONMENTS` |

GitLab summary output uses `CI_PROJECT_DIR/.control9/output/control9-summary.json` when `RUNNER_TEMP` is unavailable, matching the GitHub fallback path semantics relative to the job working directory.

### GitLab API tokens (presentation milestone)

MR note publishing reads tokens from CI/CD variables (not component inputs):

| Variable | Required | Notes |
|----------|----------|-------|
| `CONTROL9_GITLAB_TOKEN` | no | Preferred masked/protected variable with `api` scope for MR note create/update |
| `GITLAB_TOKEN` | no | Fallback when `CONTROL9_GITLAB_TOKEN` is unset |
| `CI_JOB_TOKEN` | automatic | Used only when neither variable above is set and the job runs in a merge request pipeline; subject to project job token allowlist settings |

When no token can publish MR notes, the job continues after writing collapsible sections and log prefixes; MR note state is reported as `skipped-no-token` or `skipped-permission` in structured outputs.
