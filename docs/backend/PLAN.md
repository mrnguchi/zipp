# Backend plan: build from scratch

2026-11-23 M8 direction update: the user superseded the earlier M8 hold and chose Smobilpay. [Incremental provider plan](M8_PROVIDERS.md) and [ADR 0017](adr/0017-m8-smobilpay-provider-selection.md) govern the new work. M7 is not completed or accepted by moving ahead; local-first/no-tests/no-live-payment rules remain active.

Decision date: 2026-11-06. This replaces the previous reuse/stabilization plan.

## Outcome

Build a new NestJS backend supporting rider, sender/recipient, approved driver, support, finance, and administrator workflows. Deliver new Docker services, PostgreSQL schema and Prisma migrations, Redis/BullMQ infrastructure, automated tests, secure API/event contracts, and CI/CD. Prove capacity under a documented workload before release.

Canonical implementation root: `backend/`. Keep the current `mobile/` project intact. Legacy backend code, schema, package lock, migrations, and secrets are not imported. Existing backend bugs may inform regression cases but are not remediation tasks for the new system.

## Architecture decisions

| Decision | Baseline |
| --- | --- |
| Application style | Modular NestJS monolith, feature-owned components, explicit ports/adapters; independently runnable API and worker |
| Persistence | New PostgreSQL database/schema; Prisma ORM; reviewed, committed forward migrations |
| Financial integrity | Exact XAF values, balanced immutable postings, explicit holds, atomic job/settlement transitions, durable idempotency |
| Async work | Transactional outbox plus BullMQ, bounded concurrency, retries/backoff and failed-job review |
| Redis roles | Separate durable queue Redis and ephemeral cache/rate-limit/presence Redis to isolate eviction and failure policies |
| Network interfaces | Versioned REST `/api/v1`, OpenAPI, authenticated Socket.IO with versioned events and REST resync |
| Tracking/calls | Authenticated GPS telemetry + authorized map updates; one-to-one WebRTC audio with separate TURN/media path and native incoming-call integration; see [detailed design](LIVE_TRACKING_AND_CALLS.md) |
| Runtime | Supported Node LTS and compatible stable Nest/TypeScript/Prisma versions selected together at bootstrap; exact versions locked |
| Local services | Docker Compose profiles for application, dependencies, tests, and observability |
| Delivery | GitHub Actions + OCI registry as the proposed default; immutable images promoted through staging and production |
| Production topology | Multi-instance API and worker deployment with load balancer, persistent data services, and measured scaling limits |
| Testing | Unit, real-service integration, HTTP/WS E2E, contract, security, concurrency, recovery, and k6 load tests |

No inherited requirement to retain Nest 11 or Prisma 6. Select a compatible supported baseline at scaffolding, record it in an ADR, and pin it; do not install unrelated latest versions independently. No experimental release is the production default.

Every changeable API integration and package installation/upgrade follows [documentation-first dependency policy](DEPENDENCY_POLICY.md): current official/versioned references, engine/peer/native checks, compatibility evidence and affected builds/tests before acceptance.

## Product modules and acceptance scope

| Module | Required capabilities |
| --- | --- |
| Identity | Signup, phone OTP/resend, login, password reset, refresh rotation/replay detection, logout, 2FA, recovery codes |
| Accounts | Profile, saved places, account preferences/status and deletion workflow |
| Drivers | Application, vehicle, private documents, review/resubmission, availability, location freshness, ratings and earnings views |
| Tracking | Validated driver GPS, online/job eligibility, latest location TTL/session version, selected history, authorized subscriptions, background upload and reconnect snapshots |
| Calling | Eligible participant sessions, multi-device answer claim, signaling, short-lived media credentials, native ringing/push, lifecycle/recovery and separate media limits; no recording |
| Pricing | Server route-derived expiring quotes, service classes, night rates, commission, cancellation policy and rule versions |
| Wallet | Ledger accounts/postings, reservations, captures/releases, refunds, transaction history, balances and reconciliation |
| Payments | MTN MoMo/Orange adapter boundary, attempts, authenticated callbacks/status verification, withdrawal reservation/approval/payout |
| Dispatch | Eligibility, offers, timeout/decline, radius expansion, exclusive assignment, no-supply handling |
| Trips | Quote consumption, booking+hold, driver actions, completion PIN, cancellation/disputes, receipt/history/rating |
| Deliveries | Sending/receiving context, both contacts, package/photo, Standard/Express, pickup/transit/PIN handover, returns/disputes |
| Messaging/notifications | Participant-authorized conversations, tickets, push/SMS, durable delivery tracking/retries |
| Operations | Admin/support/finance permissions, verification, reports, reconciliation, reasoned adjustments and audit trail |

MVP excludes cash, a separate Logistics product, fleet management, referrals, split rider/driver apps, and advanced automated fraud scoring. Admin APIs are included; a new admin website is a separate frontend scope. Social authentication is deferred until core identity and payment flows are verified.

## Contract rules

- Design fresh API/event contracts around requirements and actual mobile fields; publish mappings before changing mobile callers. Legacy endpoints are references only.
- Customer identity uses a deliberate display-name/contact model; never silently split/drop signup names. Normalize phones to E.164.
- Resolve UI Everyday/Comfort/Premium versus PRD Classic/Comfort/Comfort Plus in a product ADR and typed mapping.
- Completion PIN is required by the product; decide separately whether a start PIN is needed. Cryptographic codes have bounded attempts, expiry and atomic one-time consumption.
- Quotes are server-owned, expiring, versioned, associated with an actor/service/route, and consumed idempotently. Client fare or distance is not authoritative.
- Money uses integer XAF units stored as PostgreSQL `BIGINT`, mapped to TypeScript `bigint`, serialized as documented decimal strings. Commission uses integer basis points and a recorded rounding rule; never JSON-serialize raw bigint or coerce large values to Number.
- Store UTC; apply `Africa/Douala` explicitly for business rate/report boundaries.
- Receiving/sending perspective, both contacts, package size/photo, receipt access, and tracking-link privacy are modeled explicitly.
- Events include ID, type/schema version, aggregate ID/version, timestamp and validated payload. Reconnect retrieves current persisted state; socket arrival order is not authoritative.

## Decisions still requiring implementation evidence

| Item | Default or requirement | Resolve by |
| --- | --- | --- |
| Runtime/package/database images | Resolved in M0: [version ADR](adr/0001-m0-foundation.md), stable compatible packages, pinned image digests and clean Linux build | Verified 2026-11-08 |
| Hosting/registry/domain | GitHub Actions + GHCR default; host with container API/worker replicas, private networking and persistent services | Delivery foundation before real deployment |
| Capacity profile | See [capacity contract](CAPACITY.md); users, connections, RPS and GPS events measured separately | Foundation benchmark and pre-pilot gate |
| Native calling/media | Compatible Expo/RN SDK + OS call integration; direct vs relay privacy; provider/self-hosting, region, quotas and metadata retention via ADR | M7 compatibility spike, M9 media gate |
| Cancellation/commission | Configurable versioned rules; PRD range and multipliers guide policy; no copied mobile sample fee | Pricing/financial milestone |
| SMS/payment/storage/routing | Adapters with deterministic dev/test implementations; actual provider contracts and credentials for sandbox | Provider milestone |
| Recovery objectives | Proposed RPO <= 5 minutes and RTO <= 60 minutes for financial database, subject to funded backup/HA design and restore evidence | Staging |

Architecture details are in [ARCHITECTURE.md](ARCHITECTURE.md). Deployment and capacity are first-class requirements with exit gates, not future cleanup work.

## M7 completion sequencing (2026-11-23)

The user requires M7 completion before M8 and selected self-hosted WebRTC/TURN. [ADR 0016](adr/0016-m7-self-hosted-calling-direction.md) resolves that direction; native application IDs, push accounts, published SDK/plugin compatibility, relay/media/native implementation and acceptance remain open. [Completion checklist](M7_COMPLETION_CHECKLIST.md) tracks exact remaining work. Staff operations and foreground mobile communication/inbox have source; this does not certify M7 or authorize testing/deployment/provider activation.
