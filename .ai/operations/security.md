# Security

This doc describes security, privacy, and trust requirements that apply across implementation choices.

## Contract

- The repo is open source because customer-installed pipeline code benefits from public reviewability.
- Release artifacts support pinning, provenance, changelog review, and auditability.
- Signing material and API tokens are provided through CI secrets and are never logged, echoed into summaries, included in action outputs, or serialized into envelopes.
- Redaction runs before envelope signing and submission. Tests must prove that raw secrets, private keys, token-like values, environment variable values, and sensitive command output do not leave the runner in default mode.
- Debug output is safe by default: it may expose validation decisions, counts, fingerprints, and redaction markers, but it must not expose raw values that were removed from payloads.

## Redaction defaults

The `standard` redaction profile applies when customers omit `redaction-profile`. It redacts, at minimum:

- AWS access key identifiers (`AKIA…` pattern).
- AWS secret key assignments in common key/value forms.
- PEM private key blocks.
- GitHub personal access tokens (`ghp_`, `github_pat_` patterns).
- Generic secret, password, token, and API key assignments in common key/value forms.

Customers may append comma-separated regular expressions through `redaction-additional-patterns`. Additional patterns run after the standard profile and produce `CUSTOM_n` marker classes.

Envelope construction fails if the normalized summary still matches an active pattern after redaction. This fail-closed behavior prevents silent leakage when patterns miss a sensitive value.

## Signing defaults

- Algorithm: HMAC-SHA256 over the canonical unsigned envelope JSON.
- Signing secret: required `signing-secret` input mapped from a GitHub Actions secret.
- Key correlation: `keyId` is derived from a SHA-256 hash of the signing secret (first 16 hex characters). The secret itself never appears in envelopes, logs, workflow summaries, or pull request comments.
- Integrity: any change to the normalized unsigned payload produces a different signature.

## Evidence and local file safety

- Default capture is summary-only. Full artifacts and full command output are not submitted unless a future explicit opt-in input is added under a later milestone contract.
- Local summary JSON includes decision metadata and redaction counts, not raw secret values or signing material.
- Workflow rendering and pull request feedback use redacted decision templates. Rendered output must not include raw envelope payloads or secrets (covered by rendering tests).
