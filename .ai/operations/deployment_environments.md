# Deployment Environments

This doc describes environments and rollout boundaries without locking exact account or stack names.

## Contract

- The repo is open source because customer-installed pipeline code benefits from public reviewability.
- Release artifacts support pinning, provenance, changelog review, and auditability.

## Supported runner boundaries

| Runner class | Support stance |
|--------------|----------------|
| GitHub-hosted runners | Supported for GitHub Action installs when Node 20 is available and outbound HTTPS to the Control9 API is permitted |
| Self-hosted GitHub runners | Supported when administrators provide Node 20 (or use the action's bundled runtime) and outbound HTTPS to the Control9 API |
| GitLab SaaS shared runners | Supported for GitLab component installs on GitLab 15.11+ with Node 20 available in the job image and outbound HTTPS to the Control9 API |
| GitLab self-managed runners | Supported on GitLab 15.11+ when runners meet the same Node and network requirements |
| Air-gapped or offline runners | Out of scope; envelope submission requires reachable Control9 API endpoints |

Self-managed GitLab instances must expose CI/CD component `spec:inputs` support (GitLab 15.11 or newer). Customers on older GitLab versions are out of scope until they upgrade.
