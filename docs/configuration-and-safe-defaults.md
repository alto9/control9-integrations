# Configuration and safe defaults

This guide is the customer-facing reference for installing the Control9 GitHub Action with safe defaults. It describes what the action reads from your workflow, what it sends to Control9, and what stays on the runner.

The integration runs inside your GitHub Actions runner. It does not take over plan, synth, or deploy steps. It reads IaC artifacts you point at, builds a normalized summary, redacts sensitive values, signs the envelope, submits it to the Control9 policy API, and writes a local summary for workflow rendering.

## Prerequisites

- Node.js 20 or newer (`package.json` `engines.node`)
- npm on PATH (for local development and verification only; the published action runs from `dist/index.js`)

## Action inputs

Inputs are defined in [`action.yml`](../action.yml) and parsed in [`src/inputs.ts`](../src/inputs.ts). There is no separate on-disk config file for the GitHub Action.

### Defaults (safe first install)

| Input | Default when omitted | Notes |
|-------|---------------------|-------|
| `mode` | `shadow` | Submits envelopes and renders decisions without blocking the workflow on policy outcomes |
| `working-directory` | `.` | Repository-relative base for resolving `artifact-paths` |
| `redaction-profile` | `standard` | Applied when the input is omitted; see [Redaction](#redaction) |

All other inputs are required. Missing required inputs, invalid URLs, unsupported tool or command values, unreadable artifact paths, or redaction failures fail the step locally before envelope submission.

### Required inputs

| Input | Purpose |
|-------|---------|
| `control9-api-url` | Control9 policy API base URL. Must be an absolute `http` or `https` URL; trailing slashes are stripped at parse time. |
| `tenant-id` | Control9 tenant or installation identity from onboarding. |
| `signing-secret` | HMAC signing material for envelope submission. Map from a GitHub Actions secret. |
| `target-environment` | Governed environment key for this change (for example `staging` or `production`). |
| `requested-authority` | Deploy or change authority requested by this workflow step (for example `plan` or `apply`). |
| `iac-tool` | `terraform`, `opentofu`, `cdk`, or `cloudformation`. |
| `command` | `plan`, `synth`, `diff`, or `deploy-verification`. |
| `artifact-paths` | Comma-separated paths to plan JSON, synthesized templates, or diff artifacts, relative to `working-directory`. |

### Optional inputs

| Input | Purpose |
|-------|---------|
| `mode` | `shadow` (default) or `enforce`. In enforce mode, the action may block the workflow when the normalized decision requires it. |
| `working-directory` | Repository-relative directory containing artifact paths. Defaults to `.`. |
| `redaction-profile` | Names the active redaction rule set. Defaults to `standard` when omitted. |
| `redaction-additional-patterns` | Comma-separated extra regular expressions merged after the standard profile patterns. |

### Runtime mode

- **`shadow`** (default): submit signed envelopes, render observe or other decisions, and do not block the workflow on policy outcomes.
- **`enforce`**: block, wait, or fail the workflow when the returned decision requires it.

First installs should leave `mode` at the default until you have validated redaction and signing behavior in your repository.

## Redaction

Redaction runs on the normalized change summary **before** envelope signing and API submission. Implementation lives in [`src/envelope/redact.ts`](../src/envelope/redact.ts) and is invoked from [`src/envelope/build.ts`](../src/envelope/build.ts).

### Standard profile (`standard`)

When `redaction-profile` is omitted, the action uses the `standard` profile. It redacts, at minimum:

| Value class | What it matches |
|-------------|-----------------|
| `AWS_ACCESS_KEY` | AWS access key identifiers (`AKIA` followed by 16 alphanumeric characters) |
| `AWS_SECRET_KEY` | Common `aws_secret_access_key` / `secret_key` key-value assignments |
| `PRIVATE_KEY` | PEM private key blocks (`-----BEGIN … KEY-----` through `-----END … KEY-----`) |
| `GITHUB_TOKEN` | GitHub personal access tokens (`ghp_…`, `github_pat_…`) |
| `GENERIC_SECRET` | Common `password`, `secret`, `token`, and `api_key` key-value assignments |

Matched values are replaced with explicit markers such as `[REDACTED:AWS_ACCESS_KEY]`. The envelope includes a redaction report with profile name, marker list, value classes, and total redaction count.

### Additional patterns

Use `redaction-additional-patterns` to append comma-separated regular expressions. Each pattern runs after the standard profile and produces a `CUSTOM_n` marker class.

### Fail-closed behavior

After redaction, the action checks whether the normalized summary still matches any active pattern. If it does, envelope construction fails with an error and nothing is submitted to Control9. This prevents silent leakage when a pattern misses a sensitive value.

## Signing

Envelopes are signed with **HMAC-SHA256** over the canonical unsigned envelope JSON ([`src/envelope/sign.ts`](../src/envelope/sign.ts)).

| Property | Behavior |
|----------|----------|
| Algorithm | `hmac-sha256` (fixed; not customer-configurable) |
| Signing secret | Required `signing-secret` input from a GitHub Actions secret |
| `keyId` | First 16 hex characters of SHA-256 hash of the signing secret; used for correlation without exposing the secret |
| Integrity | Any change to the unsigned payload produces a different signature |

The signing secret **never** appears in:

- Action logs
- GitHub Action outputs (`envelope-id`, `artifact-fingerprint`, `decision-id`, and related outputs)
- The signed envelope JSON (only the HMAC digest and `keyId` fingerprint are serialized)
- Local summary files

Redaction completes before signing. The signed payload contains the redacted normalized change summary, not raw secret values.

## Evidence capture

For the **GitHub Shadow Mode Install** milestone, evidence capture is **summary-only**. There is no action input to submit full artifact files, full command output, or extended raw evidence to Control9.

### Included in the signed envelope (default)

- GitHub workflow context: provider, run, repository, ref or pull request, and actor identity
- Normalized change summaries derived from supported artifacts:
  - Terraform/OpenTofu plan summaries (resource action counts, addresses, provider hints, fingerprints)
  - CDK/CloudFormation template summaries (logical IDs, stack hints, resource types, fingerprints)
- Redaction report (profile, markers, counts)
- Signature metadata over the canonical unsigned envelope body

### Excluded from outbound payloads (default)

- Raw secrets, tokens, private keys, and environment variable values (replaced by redaction markers when detected)
- Full repository source code
- Full human-oriented CLI output or unstructured log streams
- Signing secrets and API tokens
- Complete pre-normalization artifact files (only normalized summaries and fingerprints cross the boundary)

Future milestones may add an explicit opt-in input for extended or full-output capture under tenant policy constraints. Until that input exists, assume summary-only behavior.

`redaction-additional-patterns` extends sensitive-string classification before serialization. It does **not** opt in to full-output capture.

## Local summary output

After a successful submission, the action writes a local summary JSON file ([`src/outputs.ts`](../src/outputs.ts)):

- **Path:** `$RUNNER_TEMP/control9-summary.json` when `RUNNER_TEMP` is set (standard on GitHub-hosted runners), otherwise `.control9/output/control9-summary.json` relative to the process working directory.
- **GitHub Action output:** `summary-path` points to this file.
- **Contents:** decision metadata, fingerprints, redaction counts, and validation status. No signing secrets or raw redacted secret values.

## Action outputs

| Output | Description |
|--------|-------------|
| `envelope-id` | Control9 envelope identifier after successful submission |
| `artifact-fingerprint` | Stable fingerprint for the normalized artifact content |
| `decision-id` | Control9 policy decision identifier |
| `decision-kind` | Normalized decision kind (`allow`, `deny`, `require_approval`, or `observe`) |
| `summary-path` | Path to the local summary JSON |
| `summary-written` | Whether the GitHub workflow step summary received the Control9 decision section |
| `pr-comment-state` | Pull request comment publish state when PR comment rendering is enabled |

## Example workflow fragment

```yaml
- name: Control9 shadow assessment
  uses: alto9/control9-integrations@v0
  with:
    # mode, working-directory, and redaction-profile use safe defaults when omitted
    control9-api-url: ${{ vars.CONTROL9_API_URL }}
    tenant-id: ${{ vars.CONTROL9_TENANT_ID }}
    signing-secret: ${{ secrets.CONTROL9_SIGNING_SECRET }}
    target-environment: staging
    requested-authority: plan
    iac-tool: terraform
    command: plan
    artifact-paths: infra/plan.json
```

Store `signing-secret` in GitHub Actions secrets. Do not echo it in workflow logs or commit it to the repository.

## Local verification

From a checkout that includes this documentation:

```bash
npm install
npm test
npm run lint
npm run build
```

Tests under `test/envelope-redact.test.ts`, `test/envelope-sign.test.ts`, and `test/envelope-build.test.ts` cover default redaction, signing, and fail-closed redaction behavior.

## Related contracts

Internal product contracts that align with this guide:

- [`.ai/runtime/configuration.md`](../.ai/runtime/configuration.md) — configuration classes and safe defaults summary
- [`.ai/data/serialization.md`](../.ai/data/serialization.md) — default include/exclude rules and summary-only capture stance
- [`.ai/data/index.md`](../.ai/data/index.md) — transient customer-edge data and default non-capture of full source or CLI output
- [`.ai/operations/security.md`](../.ai/operations/security.md) — redaction profile defaults, signing algorithm, secret handling
