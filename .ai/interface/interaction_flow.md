# Interaction Flow

This doc describes durable flows across screens, forms, checks, comments, and callbacks.

## Contract

- Developers see concise risk explanations in workflow summaries, checks, comments, job output, and merge request feedback.
- Allow, deny, require approval, and observe results remain distinguishable.
- GitHub Actions rendering follows a deterministic order after the policy response is normalized: write structured action outputs, append the Control9 workflow summary, emit notices or annotations for job visibility, and create or update the managed pull request comment when pull request context and permissions allow it.
- Missing pull request context, fork permission limits, or comment API failures do not suppress workflow summary rendering. The action records the skipped PR feedback path in logs or summary output without treating an observe decision as a deployment blocker.
- Rendering code separates policy decision semantics from GitHub transport mechanics so the same normalized decision can feed workflow summaries, checks, comments, job output, and later GitLab merge request feedback.
