# Policy HTTP contract fixtures

Mock-backed local contract fixtures for `POST {apiBaseUrl}/v1/action-envelopes` responses. These JSON files mirror the flat CI-facing HTTP shapes from `control9/.ai/specs/ci-envelope-ingestion.spec.md`.

Terminal decision fixtures (`allow-response.json`, `deny-response.json`, `require-approval-response.json`, `observe-response.json`, and `pending-response.json`) use camelCase wire fields only. `snake-case-alias-response.json` proves documented top-level snake_case aliases are accepted by the policy client normalizer.

Error scenario fixtures (`malformed-response.json`, `unavailable-api-exhaustion.json`) wrap HTTP status, optional body, and expected client failure metadata for Vitest coverage in `test/policy-client.test.ts`.

Fixtures omit internal SaaS wrapper or persistence fields (`ok`, `accepted`, `isReplay`, `enqueuedClassification`, `data`, `skeleton`). The same vectors can be reused for deployed-stage validation after canonical SaaS routes are available.
