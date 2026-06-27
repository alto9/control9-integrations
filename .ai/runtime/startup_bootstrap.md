# Startup Bootstrap

This doc describes startup or initialization behavior before normal execution begins.

## Contract

- The integration runs inside customer CI/CD runners without taking over execution.
- It starts in shadow mode for first installs and supports enforce mode when protected paths are configured.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan
- Specify local parser execution for Terraform/OpenTofu and CDK/CloudFormation commands.
