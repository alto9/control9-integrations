# Interface

Human-facing surfaces, interaction flows, and presentation contracts.

## Repo role

Public customer-edge install surface for Control9. It owns the GitHub Action and GitLab CI component/template that redact and sign envelopes, call the SaaS, and render decisions in CI/CD.

## Contract stance

- Developers see concise risk explanations in workflow summaries, checks, comments, job output, and merge request feedback.
- Allow, deny, require approval, and observe results remain distinguishable.
- Shadow mode reports what would have happened without blocking.
- Messages avoid leaking sensitive plan details by default.

## Initiative constraints

- GitHub Actions is the first fully contracted implementation path; GitLab CI is the next expansion.
- The integration stays small and does not become a local policy engine.
- Enforce mode fails closed for protected targets when the Control9 API is unavailable, while explicitly configured shadow or non-production paths may fail open.

## Mapped child docs

- `interface/input_handling.md` - Input Handling
- `interface/presentation.md` - Presentation
- `interface/interaction_flow.md` - Interaction Flow
- `interface/accessibility.md` - Accessibility
