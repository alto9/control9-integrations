# Startup Bootstrap

This doc describes startup or initialization behavior before normal execution begins.

## Contract

- The integration runs inside customer CI/CD runners without taking over execution.
- It starts in shadow mode for first installs and supports enforce mode when protected paths are configured.
- At startup, the GitHub Action or GitLab CI job validates required inputs and secrets before reading IaC artifacts. Missing API configuration, missing signing material, unsupported tool selection, or unreadable artifact paths fail locally with clear messages.
- GitLab component jobs download the pinned release bundle, export `INPUT_*` variables from component inputs, set `CONTROL9_PROVIDER=gitlab`, and invoke the GitLab runner entrypoint before artifact parsing begins.
- Terraform/OpenTofu parsing starts from generated plan JSON, typically produced by `terraform show -json`, rather than from human-oriented CLI text. CDK/CloudFormation parsing starts from synthesized templates, diff output captured as a supported artifact, or CloudFormation template summaries.
- Parser bootstrap normalizes file paths relative to the configured working directory, records the command category that produced each artifact, and rejects unsupported or ambiguous artifact combinations instead of silently producing partial envelopes.

