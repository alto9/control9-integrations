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
- **PR comments:** Publish rendered markdown through the PR comment helper when the workflow context includes an open pull request; comment create/update policy for multi-run workflows remains a later presentation decision.

GitLab merge request comment behavior, GitLab job report markdown sections, and dedicated check-run names beyond structured log output remain in the GitLab presentation milestone.

### GitLab CI baseline (component milestone)

Until the GitLab presentation milestone ships:

- **Structured logs:** Emit the same outcome label, title, and summary text used by GitHub templates as single-line or multi-line job log output.
- **Summary artifact:** Write the local summary JSON path documented in `runtime/configuration.md`.
- **Blocking:** Non-zero job exit when `blocksWorkflow` is true; zero exit otherwise.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan

- Define GitLab job output, MR comment behavior, and status semantics.
- Define PR comment update/idempotency policy across reruns and force-pushes.
