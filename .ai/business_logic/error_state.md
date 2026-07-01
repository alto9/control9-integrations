# Error States

This doc identifies product-level invalid, blocked, pending, or degraded states.

## Contract

- The integration is a customer-edge enforcement and reporting point, not the durable system of record.
- It gathers supported IaC and deploy context, redacts locally, signs an envelope, requests a SaaS decision, and renders the result where developers already work.
- **Fail-open path:** shadow mode, or enforce mode when `target-environment` is listed in optional `fail-open-environments`. API unavailability does not block the workflow.
- **Protected enforce target:** enforce mode when `target-environment` is not in the fail-open list. API unavailability blocks the workflow after bounded retries.
- **Degraded API unavailable:** the Control9 API cannot be reached after retries on a protected enforce target; the job fails with `unavailable_api` or `timeout` feedback.
- **Advisory API unavailable:** the Control9 API cannot be reached after retries on a fail-open path; the job continues with advisory `unavailable_api` or `timeout` feedback naming the configured fail-open environment.
