# External Systems

This doc describes external systems and the direction of responsibility at each boundary.

## Contract

- GitHub Actions is the first fully contracted provider; GitLab CI follows as the next expansion.
- The integration calls Control9 policy and deploy-verification APIs rather than evaluating full policy packs locally.
- The GitHub Action interface accepts mode, API base URL, tenant or installation identity, signing secret or token, target environment, requested authority, IaC tool selection, artifact paths, working directory, and optional redaction settings as inputs or environment-provided secrets.
- The first action produces structured outputs for envelope id, artifact fingerprint, decision id, decision kind, and summary path so later workflow summary, check, and pull request rendering can consume results without re-parsing raw artifacts.
- GitLab CI uses the same conceptual envelope and API boundary as GitHub Actions. GitLab-specific merge request comments and rich job report sections are owned by the GitLab presentation milestone; the GitLab component milestone covers install surface, input mapping, envelope submission, exit-code blocking, and structured log output.

## GitLab CI component (second provider)

The GitLab install surface is a CI/CD component spec file at `templates/control9-assessment/template.yml` in this repository.

### Consumption paths

- **v1 (GitHub-hosted source):** Customer pipelines `include: remote` the tagged `template.yml` URL from GitHub releases. Pin an exact semver tag in production pipelines.
- **Catalog (optional follow-up):** When Alto9 publishes a GitLab.com mirror of this repository, the same template may be referenced with `include: component:` and CI/CD Catalog versioning. Input names and behavior do not change between paths.

### Component inputs

Component `spec:inputs` mirror GitHub Action input names and semantics:

| Input | Required | Notes |
|-------|----------|-------|
| `mode` | no (default `shadow`) | `shadow` or `enforce` |
| `control9-api-url` | yes | Control9 API base URL |
| `tenant-id` | yes | Tenant or installation identity |
| `signing-secret` | yes | Masked CI/CD variable; never logged |
| `target-environment` | yes | Governed environment key |
| `requested-authority` | yes | Authority requested by this job |
| `iac-tool` | yes | `terraform`, `opentofu`, `cdk`, or `cloudformation` |
| `command` | yes | `plan`, `synth`, `diff`, or `deploy-verification` |
| `artifact-paths` | yes | Comma-separated repository-relative artifact paths |
| `working-directory` | no (default `.`) | Base for artifact resolution |
| `redaction-profile` | no (default `standard`) | Redaction rule set name |
| `redaction-additional-patterns` | no | Extra comma-separated regex patterns |
| `fail-open-environments` | no | Comma-separated environment keys; same semantics as GitHub |
| `control9-version` | no (default pinned major tag) | Release tag used when downloading the Node bundle |
| `stage` | no (default `test`) | GitLab job stage for the assessment job |

The component job maps each input to the same `INPUT_*` environment variables consumed by the shared Node entrypoint (for example `INPUT_MODE`, `INPUT_CONTROL9_API_URL`).

### GitLab workflow context

Envelope construction reads GitLab predefined CI variables when the provider is `gitlab`:

| Envelope field | GitLab source |
|----------------|---------------|
| `providerContext.provider` | constant `gitlab` |
| `providerContext.apiUrl` | `CI_SERVER_URL` |
| `runIdentity.runId` | `CI_PIPELINE_ID` |
| `runIdentity.runAttempt` | `CI_JOB_ID` |
| `runIdentity.workflow` | `CI_PIPELINE_SOURCE` or `CI_JOB_NAME` |
| `runIdentity.job` | `CI_JOB_NAME` |
| `repositoryIdentity.fullName` | `CI_PROJECT_PATH` |
| `repositoryIdentity.owner` | namespace segment of `CI_PROJECT_PATH` |
| `repositoryIdentity.name` | project segment of `CI_PROJECT_PATH` |
| `refOrPullRequestIdentity.ref` | `CI_COMMIT_REF_NAME` |
| `refOrPullRequestIdentity.sha` | `CI_COMMIT_SHA` |
| `refOrPullRequestIdentity.mergeRequestNumber` | `CI_MERGE_REQUEST_IID` when present |
| `actorIdentity.login` | `GITLAB_USER_LOGIN` |
| `correlationId` | `{CI_PIPELINE_ID}:{CI_JOB_ID}` |

### Runtime bundle

The component job downloads the tagged GitHub release asset containing `dist/index.js` (Node 20 bundle shared with the GitHub Action) before invoking the GitLab runner entrypoint. Customers pin `control9-version` to a reviewed tag.

### Feedback in this milestone

GitLab jobs emit structured log lines and write the local summary JSON artifact. Non-zero exit codes signal enforce-mode blocking per `business_logic/error_handling.md`. Merge request comments and GitLab job report markdown sections are out of scope here and documented under the GitLab presentation contracts.
