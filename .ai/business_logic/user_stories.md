# User Stories

This doc captures durable user outcomes and milestone-shaped behavior without issue numbers.

## Contract

- The integration is a customer-edge enforcement and reporting point, not the durable system of record.
- It gathers supported IaC and deploy context, redacts locally, signs an envelope, requests a SaaS decision, and renders the result where developers already work.

## GitLab stories

### GitLab component install (envelope milestone)

- As a platform engineer on GitLab CI, I include the Control9 assessment component after my plan or synth job so infrastructure changes are redacted, signed, and evaluated by Control9 before deploy authority is used.
- As a developer, I see concise outcome text in job logs and can download the summary JSON artifact.

### GitLab presentation (feedback milestone)

- As a developer reviewing a merge request pipeline, I expand a collapsible `Control9 Policy Decision` section in the job log to read the same outcome title, summary, and detail bullets I would see in a GitHub workflow summary.
- As a developer on a merge request pipeline, I see a Control9 note on the merge request when API credentials allow, and reruns update that note instead of spamming duplicates.
- As a platform engineer, I configure `CONTROL9_GITLAB_TOKEN` once per project so MR notes publish reliably without widening job token permissions beyond policy.
