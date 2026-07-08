# Messaging And Async

This doc describes asynchronous delivery, replay, notification, retry, and webhook expectations at a product level.

## Contract

- GitHub Actions is the first fully contracted provider; GitLab CI follows as the next expansion.
- The integration calls Control9 policy and deploy-verification APIs rather than evaluating full policy packs locally.
- SaaS `pending` policy responses are synchronous policy API states for the MVP CI client, not asynchronous wait states. Shadow mode records the SaaS `correlationId` in summary/output data and continues; enforce mode fails closed without polling.

## Future scope

Explicit long-lived approval waits, polling behavior, stale approval handling, and provider-specific async notification loops belong to future approval workflow work. They are out of scope for the MVP policy envelope submission client.
