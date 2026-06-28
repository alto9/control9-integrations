# Input Handling

This doc describes user or operator inputs and validation expectations at a product level.

## Contract

- Developers see concise risk explanations in workflow summaries, checks, comments, job output, and merge request feedback.
- Allow, deny, require approval, and observe results remain distinguishable.
- Renderers accept the normalized decision shape from the policy API boundary: decision kind, reason text, optional risk summary, policy version, decision id, follow-up metadata, artifact fingerprint, target environment, and redaction report.
- Message templates cover allow, deny, require approval, observe, timeout, unavailable API, redaction applied, and fingerprint mismatch outcomes with consistent fields and safe fallbacks when optional metadata is absent.
- Allow messages state that Control9 found no blocking policy concern for the evaluated artifact and include the decision id and fingerprint when present.
- Deny messages state that Control9 found a blocking policy concern, summarize the reason, and identify the artifact and policy version without exposing raw plan, template, command output, or secrets.
- Require approval messages state that human approval is required before enforce-mode deployment may continue and include the approval or follow-up metadata supplied by the API when present.
- Observe messages state that Control9 is reporting an advisory finding in shadow mode and that the workflow is not blocked by that decision.
- Timeout and unavailable API messages distinguish remote decision unavailability from local validation failures. Shadow-mode rendering reports the condition without blocking, while enforce-mode behavior is governed by runtime execution contracts.
- Redaction-applied messages summarize redaction counts or classes, not raw values. Fingerprint mismatch messages identify the expected and observed fingerprint metadata only when those values are safe to display.
