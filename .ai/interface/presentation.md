# Presentation

This doc describes how information is presented and distinguished for users.

## Contract

- Developers see concise risk explanations in workflow summaries, checks, comments, job output, and merge request feedback.
- Allow, deny, require approval, and observe results remain distinguishable.
- Shadow mode reports what would have happened without blocking except when the policy API response itself is untrustworthy (malformed response), in which case the job fails in all modes.

## GitHub Actions presentation (first provider)

For the GitHub Action path in this milestone:

- **Workflow step summary:** Append a markdown section headed `Control9 Policy Decision` containing the rendered outcome title, summary, and bullet detail lines.
- **Annotations:** Non-blocking outcomes emit a GitHub notice annotation; blocking outcomes emit a warning annotation. The annotation title is the outcome label; the message is `{label} — {summary}`.
- **Log fallback:** When `GITHUB_STEP_SUMMARY` is unavailable, emit the same content as structured log lines.
- **PR comments:** Publish rendered markdown through the PR comment helper when the workflow context includes an open pull request; comment create/update policy for multi-run workflows remains a later presentation decision.

GitLab job output, merge request comment behavior, and dedicated check-run names are out of scope for the GitHub enforce-mode outcome milestone and remain future expansion.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan

- Define GitLab job output, MR comment behavior, and status semantics.
- Define PR comment update/idempotency policy across reruns and force-pushes.
