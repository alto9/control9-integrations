# Deploy verification HTTP contract fixtures

Mock-backed local contract fixtures for `POST {apiBaseUrl}/v1/deploy-verifications` responses. These JSON files mirror the flat CI-facing HTTP shapes from `control9/.ai/specs/ci-envelope-ingestion.spec.md`.

Terminal status fixtures (`verified-response.json`, `fingerprint-mismatch-response.json`, and `no-approved-baseline-response.json`) use camelCase wire fields. `snake-case-alias-response.json` proves documented top-level snake_case aliases are accepted by the verification client normalizer.

Error scenario fixtures (`malformed-response.json`, `unavailable-api-exhaustion.json`) wrap HTTP status, optional body, and expected client failure metadata for Vitest coverage in `test/verification-client.test.ts`.

Deploy verification fixtures do not include `pending`; the MVP endpoint returns synchronous terminal statuses only. Fixtures omit internal SaaS fields (`outcome`, `approvedFingerprint`, `failureReasonCode`, `data`, `ok`, `skeleton`). The same vectors can be reused for deployed-stage validation after canonical SaaS routes are available.
