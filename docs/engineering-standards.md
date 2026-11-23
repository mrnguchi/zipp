# Zipp engineering standards

Established 2026-11-06 for the new backend in `backend/`. Legacy code is not imported or grandfathered into these rules. Read the architecture, infrastructure and capacity contracts before implementation.

## Documentation and compatibility before implementation

- Before implementing a new or changed feature that depends on changeable framework/provider/OS APIs, read the current official documentation and version-specific reference for the selected stack. Before any package/SDK/image install or upgrade, inspect actual runtime, lockfile, engine/peer/native constraints and migration notes. Follow [dependency policy](backend/DEPENDENCY_POLICY.md).
- Use compatible packages as a tested set. Record documentation URLs/date, selected versions, compatibility assumptions, security impact and verification. Do not use force/legacy-peer flags to conceal conflicts, or treat a successful install/typecheck as native/runtime proof.
- For location/calling work, read [live tracking and calls](backend/LIVE_TRACKING_AND_CALLS.md). Native/background behavior and real audio require physical-platform evidence and separate release gates.

## Code structure and quality

- TypeScript `strict` from the first commit, including null handling and no implicit any. Enable checked indexed access and unused-code checks where supported. No unchecked external casts, blanket suppressions, unexplained `any` or non-null assertions to hide errors.
- Use feature-based modules and explicit public facades. Enforce presentation -> application -> domain dependency direction, with infrastructure adapters wired through DI. Domain code is framework/database independent.
- One cohesive responsibility per file/provider/use case. Split by behavior, not arbitrary line count; avoid giant service/controller files, catch-all utilities, inheritance-heavy frameworks and premature abstraction.
- Use descriptive business names, typed input/output, explicit units, immutable value objects where useful and dependency injection for time/IDs/providers. No business logic in bootstrap, guards, response mappers or controllers.
- Keep HTTP request/response DTOs distinct from Prisma rows. Use runtime validation, explicit conversion, safe serialization and bounded pagination. Never expose internal records through an unreviewed spread/serialization.
- External provider/database errors map to stable domain/application errors; central transport mapping returns safe status/code/correlation ID. Do not swallow exceptions or return fake success.
- Parameterize SQL; raw queries require a documented reason, typed boundary, tests and review. A repository interface exists when it marks a real application/persistence boundary, not solely to wrap every Prisma method.
- Use ESLint/formatter, import boundaries and consistent file naming: kebab-case files, PascalCase types/classes, camelCase values, suffixes such as `.controller.ts`, `.module.ts`, `.port.ts`, `.spec.ts`. Name actions by intent.

## Comments and documentation

- Explain why an invariant, lock order, timeout, retry rule, rounding rule or security constraint exists. Document assumptions, failure recovery and external side effects near the relevant code.
- Use TSDoc for exported nontrivial contracts and domain functions: units, allowed states, guarantees, possible failures, idempotency and examples where helpful.
- Do not comment obvious syntax, duplicate the implementation in prose, add decorative banners or keep commented-out code. Comments must change with behavior.
- TODOs include a tracked task/reference, expected behavior and boundary; never leave TODO verification on a production security/payment path.
- Keep architecture decisions in ADRs, API/event examples in generated/checked contracts and operator procedures in runbooks. Code comments explain local intent; they do not replace architecture documents.

## Security baseline

- Authenticate by default; explicitly mark reviewed public endpoints. Enforce active account, role, ownership and recent 2FA as applicable in application use cases and both HTTP/WS transports.
- Use standard reviewed password hashing with calibrated secure parameters, crypto OTP/PIN generation, hashed one-use challenges, expiry and durable attempt limits. Do not log raw challenges or weaken hashing under load.
- Validate JWT signature, algorithm allowlist, issuer, audience, expiry and purpose. Use short-lived access tokens; rotate refresh tokens with atomic reuse detection/session revocation. Access, refresh, reset and 2FA challenge tokens are not interchangeable.
- 2FA is mandatory for admins and sensitive wallet operations under the documented policy; backup codes are hashed and single use. Client-selected roles do not confer permissions.
- Share atomic rate-limit state across replicas; implement the budgets/outage policy in [CAPACITY.md](backend/CAPACITY.md). Configure trusted proxies explicitly. CORS is an allowlist, not authentication; add CSRF protection if cookie-based auth is introduced.
- Bound JSON/message/upload sizes, request concurrency, HTTP/provider/database timeouts and pagination. Verify upload content, ownership and storage key; private signed URLs have short expiry. Restrict provider URLs to configured destinations to prevent SSRF.
- Require TLS in production and private DB/Redis networks. Use least-privilege app/migration/storage/CI roles; no secrets in Git, images, CI logs, test artifacts, exceptions or Expo public configuration.
- Redact credentials, full connection URLs, auth-bearing query parameters, OTP/PINs, payment payloads and unnecessary PII. Restrict audit/document access and define retention/deletion rules without deleting financial audit evidence incorrectly.
- Scan secrets/dependencies/images and patch with CI evidence. Critical/high exploitable production findings block release unless a reasoned, owned, expiring exception is recorded.
- Dev/test mocks are explicit and rejected by production config; production never accepts placeholder signatures or client-confirmed payments.

## Money, data and concurrency

- Financial retries, HTTP/worker error boundaries, idempotency expiry and SQL/code naming follow [financial reliability](backend/FINANCIAL_RELIABILITY.md). Read it before M3 implementation. Expiring a response snapshot must not erase duplicate-payment protection; unresolved operations remain recoverable.
- Exact integer XAF with bigint storage/domain arithmetic and string API serialization. Specify bounds, basis points, rounding and residual allocation. Never use JS floating point or silently coerce bigint.
- Posted ledger transactions balance and are immutable; compensating entries correct mistakes. Holds, pending provider attempts and posted money have distinct models. Define invariants and worked examples before coding.
- Database-backed idempotency, constraints and locks protect against parallel overspending, duplicate credits/refunds/captures, double payout, competing driver acceptance and one-driver/two-job assignment.
- Business writes, related financial writes, audit records and outbox intent share a short atomic transaction where required. Pass a typed transaction context across module facades; never start nested unrelated transactions inside atomic workflows.
- Use consistent lock ordering and bounded conflict retries. Do not hold a DB transaction open during routing, SMS, object storage or payment calls.
- Validate provider events using actual authentication/status contracts, reference, amount, currency, beneficiary and expected transition. Ambiguous timeouts remain pending until verified.
- Worker/events may replay; durable dedup and provider identities prevent duplicate effects. Never claim exactly-once delivery from a queue.
- UTC timestamps and explicit Cameroon business timezone. Record schema migrations in Git, test clean/upgrade paths and use expand/contract for rolling deployment. Do not use production `db push` or auto-reset/seed.

## Testing and gates

User-directed execution policy: implement and build locally first; run tests only on the user's explicit command, including at phase boundaries. Writing tests is allowed, but do not execute unit, integration, E2E, load/performance or deliberate failure probes, or launch aggregate commands/workflows that run them, without that command. This overrides automatic test-execution requirements below. Keep acceptance criteria and test requirements documented, and mark verification pending until execution is authorized and evidence exists. Build/compilation alone does not verify a phase.

Use a compatible locked test stack: Jest, Nest testing utilities, Supertest, Socket.IO test client, real isolated PostgreSQL/Redis services, property-based financial tests where useful and k6 for load. Select exact versions with the bootstrap matrix.

| Suite | Required evidence |
| --- | --- |
| Unit | Pure policies, pricing/rounding, transitions, validation, value objects and error cases |
| Integration | Actual PostgreSQL constraints/locks/isolation/migrations and Redis queue/limiter behavior; mocks cannot prove races |
| E2E/contract | Booted HTTP/WS app, DTO/error/auth/ownership contracts, active-job recovery, provider adapter boundary |
| Security | Wrong-purpose/expired/revoked token, refresh replay, enumeration/throttling, object access, upload limits, forged callback |
| Concurrency | Competing booking/withdrawal, two-driver claim, one-driver/two-job claim, complete/cancel race, duplicate callback/capture/refund |
| Recovery | Crash after commit/publish/provider effect, dead worker lease, provider ambiguity, queue/cache loss, reconnect and restore |
| Performance | Open arrival-rate baseline/burst/soak/failure workloads with thresholds and recorded environment |

Critical domain/application components (identity, wallet, payments, assignment, job transitions): initial minimum 90% branch coverage. Overall new backend minimum 80% branch coverage. Require meaningful invariant/negative/race tests regardless of coverage; do not game metrics with implementation-mirroring tests. Tune gates only through an ADR with evidence.

Target scripts to implement in the fresh scaffold: `typecheck`, `lint`, `format:check`, `prisma:validate`, `prisma:generate`, `test:unit`, `test:integration`, `test:e2e`, `test:contracts`, `test:security`, `build`, and `check`. `check` covers deterministic static/unit/build checks; CI separately requires real-service/security/contract suites. Performance runs in scheduled and pre-release pipelines on isolated staging.

Every meaningful behavior fix includes a regression test. Tests use deterministic clocks/fixtures, independent identities and isolated service resources; no real provider charge or shared production DB. Do not require runtime tests for documentation-only changes. State which checks ran; never claim a planned script or service exists before it does.

## Definition of done

- Product acceptance criteria and error/permission/retry paths are covered.
- Module boundaries, strict types, comments and dependency rules pass checks.
- OpenAPI/event schema, examples, mobile mappings and migrations agree with behavior.
- Required unit/integration/E2E/security/race tests pass; relevant capacity/recovery evidence is recorded.
- No placeholder verification, fake success, leaked secrets or mutable posted financial history.
- Containers build/run with health/shutdown checks; configuration and observability support the new behavior.
- Runbooks, resource budgets, rollback/forward migration notes, ADRs and roadmap evidence are current.
- Relevant official documentation/version checks and dependency compatibility evidence are recorded; unresolved platform/build checks remain explicitly pending.
- Release must additionally meet staging/pilot gates in the infrastructure and capacity documents.
