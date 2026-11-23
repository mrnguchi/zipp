# M6 implementation and verification evidence

Updated 2026-11-14. **M6 backend and opt-in mobile API implementation are present. Both local development migrations are applied. Runtime/security/race/native acceptance remains pending on the user's testing command.** No automated tests, deliberate failure scenarios, scans or load runs were executed. Earlier milestone acceptance gates remain open.

## Implemented scope

- Feature-owned delivery booking/contact/package/photo/quote/hold, shared job assignment, dispatch waves, custody lifecycle, separate PICKUP/HANDOVER/RETURN proofs, pre-collection cancellation and post-collection reviewed returns/refunds.
- Persistent idempotency, forward state/version events, worker leases/recovery, participant authorization/privacy, contact claims, booker receipt/rating and revocable coarse tracking capabilities.
- A still-active application-suspended custodian can share location for its held package and prove a return without gaining dispatch eligibility. No force-delivered/returned or timeout-release shortcut exists.
- Distinct sender/recipient phones in application and forward SQL constraint. Dispatch and acceptance also exclude a contact's current verified phone if that contact registers after booking, even before role claim.
- Client-generated 256-bit tracking secrets. Registration accepts `{id,secret,ttlSeconds}`, stores only HMAC/TTL and returns `{id,expiresAt,revokedAt}`. Identical registration replays metadata without extending/reviving access; changes conflict. Viewer credentials stay in the Authorization header. Public responses have no contact, photo, identity, code, money or secret.
- Mobile API mode connects real signup/login/SMS/TOTP/refresh/profile hydration, delivery booking/form/photo/weight/consent, server quotes/wallet/status/receipt/rating, contact claims, issues/cancellation, courier online/offers/accept-decline and foreground custody location/actions and tracking share/revoke/view. Access credentials stay in memory; native refresh storage is device-only. Delayed auth responses cannot restore a switched/signed-out session. No simulated wallet, driver movement or PIN event enters the API flow.

The backend adds ten application tables (45 total), with 36 delivery operations and 106 generated OpenAPI operations overall. See [behavior](M6_DELIVERIES.md), [mobile/runbook](M6_MOBILE_INTEGRATION.md), [ADR 0009](adr/0009-m6-delivery-custody-and-restricted-tracking.md) and its [ADR 0010 amendment](adr/0010-m6-completion-and-mobile-contracts.md).

## Local database evidence

Docker Desktop's engine was available after starting its local application; this workspace's stopped PostgreSQL service was started with `--no-deps --pull never`. No API, worker, Redis, monitoring or test stack was started. Before migration, inspection confirmed database `zipp_dev`, role `zipp_owner`, loopback port 55432 and the five completed M0-M5 migrations with marker `m5`. The ignored migration URL was checked against that identity without printing credentials.

`npm run prisma:migrate:deploy` successfully applied:

1. `20261113010000_deliveries_custody`: ten tables, reviewed foreign keys/checks/runtime grants, forward-only custody transition, deferred event/version/proof/settlement/job-assignment consistency and marker `m6`.
2. `20261114000000_m6_completion`: requested tracking TTL, revocation of pre-amendment capabilities whose client TTL intent was unknown, and distinct contact phones. This is additive; the earlier migration was not rewritten.

Read-only inspection afterward confirmed seven completed migrations, marker `m6` and 45 public application tables (excluding `_prisma_migrations`). No reset, fixture seed, customer credit, payment simulation or test-database mutation occurred. This confirms schema application, not the negative/race behavior of its constraints.

## Build and static evidence

This pass uses declared Node **24.18.0**. Allowed checks include Prisma generation/validation, strict production/test-source TypeScript compilation, ESLint, formatting, module/workflow policy inspection, production backend build/generated contracts, mobile typecheck, CJS test syntax checks and Android/iOS Metro/Hermes exports. Final outcomes: source/test TypeScript compilation, backend ESLint, production build/generated contracts, Prisma validation, backend formatting, module boundaries/workflow policy, mobile typecheck/formatting, CJS test syntax and Android/iOS API-mode exports passed. Static OpenAPI references/document links/Compose configuration also passed; the generated API has 106 operations and no secret in capability registration responses. No test runner is part of these commands. The aggregate `npm run check`, `services:test`, scanner jobs and workflow dispatches were not used.

Both Android and iOS API-mode JS/Hermes exports were produced under ignored `tmp/m6-mobile-android` and `tmp/m6-mobile-ios`, offline with one Metro worker, without loading ignored dotenv files. Exports are local compilation artifacts, not APK/IPA installation, a hosted site, native device proof or a user-flow test. The native SDK dependency graph includes exact `expo-crypto 58.0.8`, `expo-secure-store 58.0.3`, and `expo-file-system 58.0.11`; Expo 58.0.19's compatibility ranges and package peers were reviewed before installation. File-system was hoisted from Expo's existing same-version nested copy. No major upgrade, forced peer override or backend package/image/service change was introduced.

## Test source, deliberately unrun

The cross-service fixtures now create a complete quote/hold/job/booking/event aggregate. A bare RIDE/DELIVERY job violates deferred consistency and is no longer used to represent a real assigned job. Fixture cleanup follows normal forward transitions; a collected package is never discarded just to clean a test.

`backend/tests/integration/deliveries.spec.ts` contains 19 cases for isolated `zipp_test` only: sending and receiving booking/hold/rollback, concurrency and shared ride exclusion, purpose-bound proofs and durable failure/issuance limits, provider outage invalidation, post-collection cancellation refusal, independent reviewed sender return, fees/refunds, exhausted search, private tracking/revocation/expiry, late verified contact claim, suspended custodian location/return, private photo ownership/signature/digest/expiry/orphan retry, terminal courier redaction, complete-versus-return and claim-versus-accept races. Free fixture couriers are taken offline between cases to avoid contaminating later candidate waves.

`backend/tests/e2e/deliveries.spec.ts` contains nine HTTP cases using the real security guard/controllers with explicit application/admission doubles: anonymous/role/MFA/ownership errors, strict input and request identities, safe financial failures/no-store headers, bounded event resync, code acknowledgements, tracking metadata, public capability header handling and raw/private photo transport. These doubles cannot prove PostgreSQL authorization or distributed Redis behavior; the integration suite owns service/DB evidence.

`mobile/tests/deliveryApi.test.cjs` contains eight cases for credential shape, remote contract/money/privacy validation, custody/terminal policy, safe errors/Retry-After, no blind mutation retries, single-flight rotation, ambiguous refresh handling and stale refresh after sign-out. Existing draft tests now supply a required photo/weight and cover size bounds/distinct contacts. Native crypto/store/network calls are controlled doubles; they do not establish native execution.

No suite, fixture, developer code mailbox command, actual booking, GPS flow, real SMS, provider payment or manual failure probe was invoked.

## Acceptance still requiring explicit testing

1. Execute the written suites against the separately identified test database/services on command, including migration/runtime grants, proof/version/settlement triggers, races, authorization and recovery. Measure coverage rather than claiming it from test source.
2. Exercise multiple API/worker instances, queue/cache failure, expired leases/review retry, delayed/offline clients, event ordering/resync and query/pool/queue budgets. No 1,000-user capacity claim exists.
3. Install supported native binaries and verify Android/iOS permissions, secure-store failures, foreground/background/resume, stale GPS, small/large phones, tablet/font scaling, accessibility, web, device networking and full sender/recipient/courier flows. Background native tracking and realtime acceptance remain M7/pre-release work.
4. Approve commercial fares, cancellation/package/prohibited-goods policy and production code delivery. Real SMS, storage/scanning/retention, routing and payment integrations remain M8/pre-release work; fixture values/providers are not commercial approval.

Delivery/media/mobile API flags were not enabled in the user's ignored configuration. No API/worker restart, Docker image rebuild, remote release, paid service, optional monitoring or hosting was performed. Only PostgreSQL was started for the authorized local migration. **Implementation completion is separate from verified phase completion and production readiness.**
