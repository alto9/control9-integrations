# Presentation

This doc describes how information is presented and distinguished for users.

## Contract

- Developers see concise risk explanations in workflow summaries, checks, comments, job output, and merge request feedback.
- Allow, deny, require approval, and observe results remain distinguishable.
- Shadow mode reports what would have happened without blocking except when the policy API response itself is untrustworthy (malformed response), in which case the job fails in all modes.

## GitHub Actions presentation (first provider)

For the GitHub Action path in this milestone:

- **Workflow step summary (policy commands):** Append a markdown section headed `Control9 Policy Decision` containing the rendered outcome title, summary, and bullet detail lines.
- **Workflow step summary (deploy verification):** Append a markdown section headed `Control9 Deploy Verification` for `command: deploy-verification` outcomes (`verified`, `fingerprint_mismatch`, `no_approved_baseline`, and verification API failure outcomes).
- **Annotations:** Non-blocking outcomes emit a GitHub notice annotation; blocking outcomes emit a warning annotation. The annotation title is the outcome label; the message is `{label} — {summary}`.
- **Log fallback:** When `GITHUB_STEP_SUMMARY` is unavailable, emit the same content as structured log lines.
- **PR comments:** Publish rendered markdown through the PR comment helper when the workflow context includes an open pull request. Idempotency uses an HTML comment marker scoped to workflow and job name (`control9-pr-feedback`); reruns and force-pushes update the existing comment when the marker matches.

## GitLab CI presentation (second provider)

For the GitLab runner path after the component milestone baseline ships:

### Job status semantics

- **Pass/fail:** Job exit code remains authoritative per `business_logic/error_handling.md`. Presentation helpers run before exit; they do not introduce a separate GitLab external status or check entity.
- **Outcome visibility:** Developers read the classified outcome from collapsible job log sections, advisory/warning log prefixes, optional merge request notes, and the summary JSON artifact at the path in `runtime/configuration.md`.

### Collapsible job log sections

- **Policy commands:** Emit a collapsible job log section headed `Control9 Policy Decision` containing the rendered outcome title, summary, and bullet detail lines (same markdown body as GitHub workflow summaries).
- **Deploy verification:** Emit a collapsible section headed `Control9 Deploy Verification` for `command: deploy-verification` outcomes.
- **Section markers:** Use GitLab `section_start` / `section_end` escape sequences with a stable section id (`control9-policy-decision` or `control9-deploy-verification`). Sections are expanded by default (no `[collapsed=true]`).
- **Log fallback:** When section markers cannot be emitted, reuse the GitLab component baseline structured log lines.

### Log prefixes (annotation parity)

GitLab has no check annotation API. Before the collapsible section, emit one prefixed log line:

- Non-blocking outcomes: `Control9 NOTICE: {label} — {summary}`
- Blocking outcomes: `Control9 WARNING: {label} — {summary}`

### Merge request notes

- Publish rendered markdown as an MR note when `CI_MERGE_REQUEST_IID` is present and a usable GitLab API token is available.
- **Marker:** `<!-- control9-mr-feedback:pipeline={CI_PIPELINE_ID}:job={CI_JOB_NAME} -->` prepended to the note body.
- **Idempotency:** List existing MR notes, update when the marker matches, create otherwise. Reruns and force-pushes update in place (same policy as GitHub PR comments).
- **Skip states:** Mirror GitHub PR comment states: `created`, `updated`, `skipped-no-mr`, `skipped-no-token`, `skipped-permission`, `failed-fallback`. Skipped MR notes do not fail the job; collapsible sections and log prefixes remain available.

### GitLab CI baseline (component milestone)

When the GitLab presentation path is not yet wired, jobs still emit:

- **Structured logs:** Outcome label, title, and summary text as job log output.
- **Summary artifact:** Local summary JSON at the path in `runtime/configuration.md`.
- **Blocking:** Non-zero job exit when `blocksWorkflow` is true.

## Open implementation decisions

No open presentation decisions for MVP `pending` handling or runtime mode vocabulary. SaaS `pending` responses render as effective `observe` in shadow mode and as immediate fail-closed feedback in enforce mode; they do not render a client-side wait state.

### Control9 project plan

- Define future enforce-mode approval wait, polling behavior, and stale approval handling for explicit approval workflows (`runtime/execution_model.md`, `integration/messaging_async.md`).
