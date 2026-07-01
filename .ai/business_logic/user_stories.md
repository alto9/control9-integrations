# User Stories

This doc captures durable user outcomes and milestone-shaped behavior without issue numbers.

## Contract

- The integration is a customer-edge enforcement and reporting point, not the durable system of record.
- It gathers supported IaC and deploy context, redacts locally, signs an envelope, requests a SaaS decision, and renders the result where developers already work.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### GitLab component install (envelope milestone)

- As a platform engineer on GitLab CI, I include the Control9 assessment component after my plan or synth job so infrastructure changes are redacted, signed, and evaluated by Control9 before deploy authority is used.
- As a developer, I see concise outcome text in job logs and can download the summary JSON artifact even before merge request comment rendering ships.

### Remaining GitLab presentation stories

- Rich GitLab job report sections and merge request comment formats remain in the GitLab presentation milestone (`interface/presentation.md` open bullets).
