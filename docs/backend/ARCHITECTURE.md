# Backend architecture and component boundaries

Status: required blueprint for a fresh implementation. M0 platform/API/worker/configuration code and local Compose now exist; see [verification](M0_VERIFICATION.md). The full folder tree below includes future components and feature conventions, not a claim that every artifact is implemented.

## Runtime components

Ingress terminates HTTPS, enforces request/body/connection limits, and distributes requests to stateless Nest API replicas. API handlers call application use cases; those own transactions and domain rules through narrow ports. PostgreSQL commits business state, idempotency and outbox together. Outbox relays publish retry-safe work to BullMQ. Separate workers execute payment/SMS/push tasks and scheduled reconciliation. Socket.IO delivers authorized state updates; REST provides recovery snapshots.

API and worker use the same built application image with different entry commands. Scale them independently; workers do not start HTTP/socket servers, and API replicas do not accidentally register repeatable workers. Health endpoints may be exposed on an internal worker management port.

Start with these components in one repository and database. Separate microservices only when measured scaling, deployment or ownership constraints justify the distributed-consistency cost. Container separation does not require splitting business modules into services.

## Proposed repository layout

```text
zipp/
  mobile/                         existing mobile application
  backend/
    src/
      main.ts                     API composition/boot entry
      worker.ts                   worker composition/boot entry
      app.module.ts               API root wiring
      worker.module.ts            worker root wiring
      config/                     validated typed config by concern
      platform/
        database/                 Prisma lifecycle, transaction adapter
        redis/                    separate cache/queue clients
        queues/                   queue registry, worker lifecycle
        outbox/                   durable publishing, leases, retries
        observability/            logging, metrics, tracing
        health/                   liveness/readiness
        security/                 common auth plumbing, request limits
        storage/                  private upload adapters
      shared/
        contracts/                small stable cross-module primitives
        errors/                   safe transport error mapping
      modules/
        identity/
        accounts/
        drivers/
        tracking/
        calling/
        pricing/
        wallet/
        payments/
        dispatch/
        trips/
        deliveries/
        messaging/
        notifications/
        operations/
    prisma/
      schema.prisma
      migrations/
      seed.ts                     explicit development/test fixtures
    tests/
      integration/
      e2e/
      contracts/
      security/
      fixtures/
      helpers/
    scripts/                      checked setup/maintenance commands
    Dockerfile                    multi-stage API/worker image
    .dockerignore
    .env.example                  names + safe dummy values
    package.json
    package-lock.json
  infra/
    compose/                      local/test/profile definitions
    ingress/                      reverse-proxy configuration
    observability/                telemetry/dashboard configuration
    deploy/                       deployment/IaC for chosen host
  performance/
    k6/                           workload scenarios, fixtures, thresholds
  .github/workflows/             PR CI, image release, deployment
  docs/backend/                   architecture, ADRs, contracts, runbooks
```

Feature example (wallet):

```text
wallet/
  wallet.module.ts               module wiring and exported facade
  wallet.facade.ts               typed public module contract
  domain/
    money.ts                    exact-value object and rounding policy
    ledger-rules.ts             balanced posting/reservation invariants
    ledger-rules.spec.ts
  application/
    use-cases/
      reserve-funds.ts
      reserve-funds.spec.ts
    ports/
      wallet-repository.port.ts
  infrastructure/
    persistence/
      prisma-wallet.repository.ts
      wallet.mapper.ts
  presentation/
    http/
      wallet.controller.ts
      dto/
      responses/
```

Create folders only when they have a real responsibility. Simple read-only features may collapse unnecessary layers; money, identity and job lifecycles retain explicit boundaries. Component-based organization here means cohesive feature modules and focused injectable providers, not frontend components.

## Dependency and module rules

- Presentation -> application -> domain. Infrastructure implements application/domain ports; module wiring provides implementations. Domain code imports no Nest, Prisma, Redis, HTTP, or provider SDK.
- Modules export facades/contracts, not Prisma repositories or internal entities. Import other modules only through their public facade. Enforce forbidden imports in lint/dependency tests.
- Use constructors and explicit DI tokens; no hidden service locator, mutable global singleton, or static dependency lookup. Do not solve circular business dependencies with routine `forwardRef`.
- Shared code is limited to stable shared primitives. Feature DTOs, models, policies and utilities stay inside their owner module.
- Transport handlers validate/map requests and responses; application use cases enforce authorization, orchestrate transactions and call pure rules. Never put SQL, prices, or settlement logic in controllers/gateways.
- Services have focused names such as `CompleteTrip` and `ReserveFunds`; avoid a giant service for every action. Do not add an interface for every trivial class without a boundary/testing reason.

## Database ownership and transaction design

- A module owns writes to its tables. Cross-module atomic operations use an explicit transaction/unit-of-work contract passed to participating facades; do not create hidden independent transactions inside booking/settlement.
- PostgreSQL is authoritative. Redis accelerates reads, presence and work delivery; losing Redis cannot erase ledger/job state.
- Model identity/session/challenge data, driver application/documents, pricing/quotes, bookings/lifecycle logs, ratings, messages/tickets, payment attempts/provider receipts, financial ledger/reservations, active assignments, idempotency, outbox, and audit as fresh requirements-driven entities.
- Use exact XAF `BIGINT` values. Balanced ledger transactions contain immutable signed postings across explicit customer/driver/platform/clearing accounts. Distinguish financial postings from pending provider attempts and holds. Define worked examples and conservation properties before money code.
- Use database constraints for uniqueness, nonnegative/bounded fields where applicable, ownership references and valid references; use explicit SQL migrations for constraints/indexes Prisma cannot express.
- One shared driver-assignment record enforces at most one active job per driver across both rides and deliveries. Job claiming uses conditional update/locking with a tested isolation/retry strategy.
- Lock per-wallet mutation/financial aggregate consistently, including multi-account settlement lock ordering. Use short transactions and bounded retries for retriable conflicts. A transaction without correct isolation/conditions is insufficient.
- Do not use read replicas or caches for spend authorization, claim decisions or immediate post-payment correctness. Add replicas later for tolerated-stale reporting.
- New indexes follow query plans and documented access patterns; large histories use pagination and retention/archival policy.

## Events, background work and realtime

Detailed location/map/call design lives in [LIVE_TRACKING_AND_CALLS.md](LIVE_TRACKING_AND_CALLS.md), including command fields, location epochs/freshness, background upload transport, call states/native push, privacy, relay deployment and acceptance tests. Read it before implementing those features and follow [dependency policy](DEPENDENCY_POLICY.md) before choosing/installing related SDKs.

- Commit state + outbox + operation identity atomically. A relay uses leases/claiming so replicas can publish safely; mark delivery with retry-safe state. Recover abandoned leases and tolerate publish-before-mark crashes.
- A worker uses durable deduplication and provider idempotency, bounded retries with jitter, explicit timeout, failed-job inspection and replay tools. Queue delivery is at least once; exactly-once financial effects come from database invariants.
- Keep queue payloads small, versioned and free of unnecessary sensitive data. References point to persisted state; do not trust stale payload decisions.
- Use event aggregate versions, not global ordering assumptions. Authorize room subscriptions and every client command. Users may only observe their own/assigned jobs or permitted support cases.
- Use handshake auth rather than query tokens, disconnect revoked/expired sessions according to policy, bound messages/connections, and recheck account eligibility.
- Multi-instance sockets require an adapter and an explicit transport/load-balancer policy. Long-polling requires sticky routing; WebSocket-only avoids that requirement but must be tested with mobile reconnect/proxy behavior.
- Share public delivery tracking only through minimal-data, expiring, revocable capabilities; never expose internal private channels.
- `tracking` owns validated latest-position telemetry and restricted snapshots; `calling` owns authorized call sessions and signaling. WebRTC/media relay carries audio independently of Nest HTTP/Socket.IO signaling and BullMQ. PostgreSQL persists minimal call metadata and selected location checkpoints, not audio or unbounded raw signaling/GPS packets.

## API and error contracts

REST prefix `/api/v1`; OpenAPI generated and validated in CI. Use explicit response DTOs, bounded cursor/page contracts, UTC ISO timestamps, string money amounts, stable error code/message/correlation ID and safe field errors. Use 409 for operation conflicts, 429 plus Retry-After for quotas and 503 for controlled overload/dependency unavailability. Avoid leaking internal exceptions or treating all failures as 500.

Idempotency is scoped by actor + operation + key, with request fingerprint, unique persistence, completed response and retention policy. Same key/different input conflicts; same key/same input replays the same logical result. Public callbacks use provider event/reference identity and provider-specific verification.

M3 follows [financial reliability](FINANCIAL_RELIABILITY.md), [ADR 0005](adr/0005-financial-retries-errors-and-naming.md) and [ADR 0006](adr/0006-m3-ledger-and-payment-execution.md): a 24-hour response window after terminal completion, durable duplicate prevention beyond snapshot expiry, no expiry of unresolved financial operations, explicit network recovery/error mappings and meaningful SQL/code naming. [Backend source/local schema are present](M3_VERIFICATION.md); runtime acceptance remains pending and no destructive cleanup is enabled. The cohesive finance module owns wallet/payment components to avoid circular feature dependencies; it exports only its public facade/contracts.

## Decision records

M5 adds a `jobs` feature owning shared RIDE/DELIVERY job identities and unique active driver/job slots, plus a `rides` feature for booking/lifecycle/dispatch. Drivers/finance consult the public job facade for busy/account-closure checks; jobs has no upstream feature dependency. [ADR 0008](adr/0008-m5-booking-assignment-and-ride-lifecycle.md) records transaction/lock/PIN/partial-capture/recovery decisions. [M5 source is present](M5_VERIFICATION.md); runtime/native/race acceptance remains pending. Current tracking recovery is participant REST over M4 latest snapshots; Socket.IO/native and geo fanout are not yet implemented.

Store ADRs under `docs/backend/adr/` with status/date, context, options, chosen approach, consequences, security/data impact and verification. Initial records cover version matrix, module boundaries, money/holds, assignment concurrency, rate-limit policies, deployment topology, provider contracts and privacy/retention. Changing these requires an ADR update and relevant regression tests.

## M7.1 participant stream (2026-11-20)

[ADR 0011](adr/0011-m7-participant-live-stream.md) records the initial API-only Socket.IO live participant module and focused public ride/delivery projections. The first slice uses bounded authoritative pull snapshots and shared queue-Redis connection leases; it does not broadcast across process-local rooms or rely on a local busy flag. A room adapter/outbox fanout is deferred until introduced with current per-recipient authorization and measurement. No new schema/service or worker key is needed. Current three-second cadence/500 global admission cap is deliberately not a claim of the two-second/1,000-user target. [M7 runbook](M7_REALTIME.md) and [evidence](M7_VERIFICATION.md) distinguish implementation from pending runtime/native/load gates and remaining chat/push/calling/staff slices.

## M7.2 durable communications (2026-11-20)

[ADR 0012](adr/0012-m7-chat-and-support-tickets.md) adds a feature-owned `communications` REST module with job conversations, support tickets, immutable sequenced messages/receipts/events and private monotonic cursors. Owning ride/delivery public facades supply current participant/writable context inside the caller transaction; no foreign persistence, cached membership or staff-role bypass. Lock identity/job before thread, allocate messages and durable intents atomically, and check authorization before idempotency replay. Support staff require current SUPPORT/ADMIN plus recent MFA; ticket permissions confer no financial/custody/job override. Five tables are defined in unapplied migration source; optional communications schema marker is separate from base readiness. No new package/service or chat broadcaster is added. [Runbook](M7_CHAT_SUPPORT.md) and [evidence](M7_VERIFICATION.md) record default-off config, pending migration/tests/mobile/retention and subsequent push/calling/operations scope.

## M7.3 private notification delivery (2026-11-20)

[ADR 0013](adr/0013-m7-notification-devices-and-durable-delivery.md) adds four notification tables in unapplied migration source, a private device/inbox API, and opt-in consumer in the existing worker. Dependency direction is communications -> notifications -> identity/accounts; notification delivery imports no communication persistence. Source facade enqueues a bounded deduplicated set of current participant IDs inside the source transaction, excluding author. Intents, inbox and per-device/generation deliveries use PostgreSQL uniqueness and short transactions; Redis queue is replayable transport. Lock owner before device/outbox/delivery, recheck current account/session/preferences/generation and finish only a live matching lease. Generic activity carries no protected source/body/token data and grants no resource access. Dedicated notification crypto keys do not require API identity signing keys in worker. Local captures are not phone/provider delivery. [Runbook](M7_NOTIFICATIONS.md) and [evidence](M7_VERIFICATION.md) retain queue/native/provider/load/retention gates and default-disabled flags. No new package/container/service or live provider is introduced.

## M7.4 local calling foundation (2026-11-21)

[ADR 0014](adr/0014-m7-call-control-and-ephemeral-signaling.md) introduces feature-owned call metadata/command receipts/events, unique account reservations, atomic callee-device claim and finite local deadlines. Calling imports public ride/delivery eligibility and notification device-proof boundaries. Source schema has four additional unapplied tables (58 total); optional `calling=m7_4` marker leaves base `m6` unchanged when disabled. Exact job/account/session/device authorization surrounds encrypted ephemeral Redis signaling, with Redis I/O outside DB transactions and a second authorization before response. No raw SDP/ICE in durable data/logs/queues and no audio/provider/TURN/native/CONNECTED claim. Reaper is opt-in metadata-only in the existing worker, with no API signal/signing keys or new service. Entry points explicitly select API/worker role before providers construct. [Runbook](M7_CALLING.md) and [evidence](M7_VERIFICATION.md) retain all runtime/SQL/native/media acceptance and production enablement gates; M7 calling is incomplete.

## M7.5 operations and M7 mobile continuation (2026-11-23)

[ADR 0015](adr/0015-m7-staff-operations.md) adds API-only owner-controlled staff cases, versioned metadata/receipts, role/recent-MFA checks, minimal public-facade summaries, guarded nonstaff account status and page reports. No new service, generic force-job/funds API or private chat bypass. Account suspension includes bound delivery contacts and unresolved-payment guards under sorted identities; reactivation never revives revoked sessions. [Mobile integration](M7_MOBILE_COMMUNICATIONS.md) uses private REST recovery and native pending-key metadata without message persistence. Source count is 61 tables; four M7 migrations remain unapplied. User chose self-hosted WebRTC/TURN in [ADR 0016](adr/0016-m7-self-hosted-calling-direction.md); that direction does not implement media/native/push. [Completion checklist](M7_COMPLETION_CHECKLIST.md) holds M8.
