# Presentation

This doc describes how information is presented and distinguished for users.

## Contract

- Developers see concise risk explanations in workflow summaries, checks, comments, job output, and merge request feedback.
- Allow, deny, require approval, and observe results remain distinguishable.
- The first GitHub Action presents decisions through a `Control9 Policy Decision` workflow summary section, GitHub Actions notices or annotations, structured action outputs, and a managed pull request comment when pull request context and token permissions are available.
- GitHub feedback uses consistent sections for decision, target, artifact fingerprint, risk summary, policy metadata, redaction status, and follow-up action. Full command output, raw envelope payloads, secrets, tokens, and unredacted values are not rendered.
- Pull request feedback is owned by a stable hidden Control9 marker so reruns update the existing comment instead of creating duplicate comments. If pull request context or write permission is missing, workflow summary and job log feedback remain sufficient.
- Observe decisions are advisory in GitHub shadow-mode rendering. They must not fail the action step, block deploy workflows, or require approval solely because the normalized decision kind is `observe`.
- Allow, deny, require approval, and observe keep distinct labels and tone: allow is permitted, deny is blocked only where enforce-mode logic applies, require approval points to the approval path, and observe reports what Control9 found without changing deploy authority.
- GitLab job output and merge request feedback use the same decision vocabulary when GitLab support is implemented later, but GitHub Actions is the first contracted rendering path.
