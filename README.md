# control9-integrations

Public pipeline integrations for Control9.

Control9 governs infrastructure changes where teams already ship: GitHub Actions and GitLab CI/CD. This repository owns the small install surface that runs in customer repositories, collects infrastructure change context, redacts sensitive data, sends a signed action envelope to the Control9 control plane, and reports the decision back into the workflow, pull request, or merge request.

The integration is intentionally not the system of record. Evidence, approvals, policy versions, and long-lived audit history belong in the Control9 control plane. The GitHub Action and GitLab CI component are enforcement and reporting points at the edge.

## What This Repo Owns

- GitHub Action for shadow-mode and enforce-mode infrastructure checks.
- GitLab CI component or reusable template for the same Control9 workflow in GitLab.
- Helpers for CDK synth/diff, CloudFormation template summaries, Terraform/OpenTofu plan JSON, command classification, deploy verification, and redaction.
- Stable action-envelope construction and signing before payloads leave the customer pipeline.
- Workflow feedback: GitHub checks, PR comments, GitLab job status, merge request comments, and blocked-action explanations.
- Install examples and configuration references for customer repositories.

## First Version Scope

The first useful version should prove the GitHub shadow-mode path without blocking deploys:

1. A workflow step runs `terraform plan`, `terraform show -json`, `cdk synth`, `cdk diff`, or a supported deploy-prep command.
2. The Control9 integration builds a redacted action envelope with actor, repo, branch, tool, target environment, plan or template summary, requested authority, and artifact fingerprint.
3. The integration signs the envelope and sends it to the Control9 policy API.
4. Control9 returns `allow`, `deny`, `require_approval`, or `observe`.
5. In shadow mode, the workflow continues and posts a clear risk summary. In enforce mode, the workflow blocks, waits, or proceeds based on the returned decision.

## GitHub Actions Flow

1. A PR or deploy workflow runs plan, synth, diff, or command classification.
2. The Control9 GitHub Action redacts sensitive fields and submits a signed action envelope.
3. The control plane evaluates policy and returns a decision.
4. The GitHub check passes, fails, waits for approval, or reports shadow-mode findings before production deploy authority is used.

## GitLab CI Flow

1. A merge request pipeline runs plan, synth, diff, or deployment preparation.
2. The Control9 CI component redacts sensitive fields and submits a signed action envelope.
3. The control plane returns `allow`, `deny`, `require_approval`, or `observe`.
4. The GitLab job passes, fails, waits for approval, or posts merge request findings before protected deploy jobs run.

## Deploy Verification

Approval is only useful if the deployed artifact is the one that was approved. The integration should support a deploy verification step that compares the current plan, template, or artifact fingerprint with the approved fingerprint recorded by Control9.

If the fingerprint no longer matches, the integration must stop the deploy in enforce mode and return a clear explanation. In shadow mode, it should report the mismatch as a high-risk finding.

## Data Handling

The integration should redact secrets before data leaves the customer boundary. By default, it should avoid sending:

- Raw secrets, tokens, private keys, and environment variable values.
- Full source code.
- Full command output.

Default payloads should contain structured metadata, plan or template summaries, resource identifiers where needed for evidence, policy-relevant context, and fingerprints.

## Configuration Model

Customer repositories should be able to configure:

- Control9 API endpoint and tenant identity.
- Shadow or enforce mode.
- Target environment and protected deploy authority.
- Tool paths for Terraform/OpenTofu, CDK, CloudFormation, and shell deploy steps.
- Policy bundle or policy pack reference.
- Redaction options and optional evidence capture settings.

## Near-Term Build Priorities

- Define the stable action-envelope schema with examples for Terraform, CDK, deploy verification, and CloudTrail-related events.
- Ship the GitHub Action shadow-mode path first.
- Add Terraform/OpenTofu and CDK/CloudFormation parsers with fixture coverage.
- Add enforce-mode handling for approval-required and deny decisions.
- Add deploy verification against approved fingerprints.
- Add GitLab CI support after the GitHub path proves demand.

## GitHub Action (Shadow Mode)

The first shipped action validates IaC artifacts locally, fingerprints them, and writes a summary file without blocking deploys. Envelope signing and policy submission arrive in later milestones.

```yaml
name: Control9 shadow assessment

on:
  pull_request:
    paths:
      - "infra/**"

jobs:
  control9-shadow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Terraform plan
        working-directory: infra
        run: |
          terraform init -backend=false
          terraform plan -out=tfplan
          terraform show -json tfplan > plan.json

      - name: Control9 shadow assessment
        uses: alto9/control9-integrations@v0
        with:
          mode: shadow
          control9-api-url: ${{ vars.CONTROL9_API_URL }}
          tenant-id: ${{ vars.CONTROL9_TENANT_ID }}
          signing-secret: ${{ secrets.CONTROL9_SIGNING_SECRET }}
          target-environment: staging
          requested-authority: plan
          iac-tool: terraform
          command: plan
          artifact-paths: infra/plan.json
          working-directory: .
```

Shadow mode keeps the workflow non-blocking while Control9 records what would have happened. Replace `@v0` with a pinned release tag when you adopt the action in production repositories.

## Local Development

Prerequisites:

- Node.js 20 or newer
- npm on PATH

Commands:

```bash
npm install
npm test
npm run lint
npm run build
```

The build bundles `src/index.ts` into `dist/index.js`, which `action.yml` references for GitHub Actions execution.

Fixture directories under `fixtures/` support upcoming parser, envelope schema, and redaction work:

- `fixtures/terraform/` and `fixtures/opentofu/` for plan JSON
- `fixtures/cdk/` and `fixtures/cloudformation/` for synthesized templates
- `fixtures/envelope/` for canonical envelope examples
- `fixtures/redaction/` for redaction regression cases

## Related Repositories

- `control9`: SaaS control plane, policy API, approval workflow, evidence timeline, billing, and admin UI.
- `control9-policy-packs`: baseline policies and semantic classifiers used by Control9 decisions.
- `control9-www`: public marketing site, assessment CTA, pricing, docs links, and onboarding content.
