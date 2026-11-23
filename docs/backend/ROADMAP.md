# Fresh backend delivery roadmap

2026-11-23 M8 direction update: user authorized M8 work while M7 remains incomplete, superseding the earlier hold below. Smobilpay S3P selected for payments; no sandbox account yet. [Step-by-step M8 plan](M8_PROVIDERS.md) and [ADR 0017](adr/0017-m8-smobilpay-provider-selection.md) record onboarding/version/authentication gates and the SMS shortlist. M8 is at planning/documentation review only; no provider adapter or live/payment/test operation enabled.

2026-11-23 continuation: M7.5 staff operations and foreground mobile chat/support/activity inbox source are present. Current source: 61 application tables, 138 REST operations, four unapplied M7 migrations. Real push/audio/native calling and all authorized runtime/media/security/race gates remain open. User chose self-hosted WebRTC/TURN and requires M7 completion before M8; **M8 has not started**. Read [completion checklist](M7_COMPLETION_CHECKLIST.md), [operations](M7_OPERATIONS.md), [mobile integration](M7_MOBILE_COMMUNICATIONS.md) and [self-hosted ADR](adr/0016-m7-self-hosted-calling-direction.md). Last identified applied DB evidence remains 45/base m6; local DB connection and Docker engine were unavailable on 2026-11-23. No tests or migration ran.

Updated 2026-11-21. **M0 is verified complete**; [evidence](M0_VERIFICATION.md) records its scope and 32 passing tests. **M1 implementation is complete; verification is pending on command. M2-M6 backend implementation is present; M6 mobile API source is opt-in, and runtime/security/native verification remains pending. M7 has stream, chat/support, local device/notification and local call-control/signaling foundation source; verification remains pending.** Actual media/native calling, broader M7 operations and M8-M9 remain pending. Hosting is deferred until complete implementation, authorized verification and explicit deployment authorization. Legacy implementation does not count toward completion.

## M0 - New repository scaffold and local containers

Status: verified complete on 2026-11-08. Setup: [backend README](../../backend/README.md). Version/source decision: [ADR 0001](adr/0001-m0-foundation.md).

Create `backend/` from scratch with strict TypeScript, a verified supported dependency matrix, Nest API/worker composition, feature conventions, Prisma schema/migration setup, formatter/linter and test harness. Add API/worker multi-stage image, Compose PostgreSQL, separate queue/cache Redis, migration job, isolated test resources and optional private storage/telemetry profiles. Add safe env examples, validated config, liveness/readiness, structured redacted logs and graceful shutdown.

Exit: clean checkout can install deterministically, build images, start dependencies/API/worker, migrate a fresh isolated DB, pass smoke/config/unit checks, and stop cleanly. No legacy code or secrets copied.

All milestones obey [dependency policy](DEPENDENCY_POLICY.md): research official version-matched APIs and verify compatible packages before integration/install/upgrade; record evidence and pending checks.

## M1 - CI/CD and operational foundation

Status: **implementation complete; verification pending**, following the local-first sequence in [ADR 0003](adr/0003-local-first-manual-verification.md). Build/static CI, opt-in test/scanner/load jobs, dormant release/staging workflows, scan commands, release/deployment contracts, optional telemetry/dashboard/alerts and load scripts are implemented. See [delivery runbook](DELIVERY_RUNBOOK.md) and [M1 evidence](M1_VERIFICATION.md). No hosting, registry publishing or workflow activation is required during local implementation. M2 implementation can proceed when requested; outstanding verification gates remain mandatory before a verified-complete or release claim.

Depends on M0. Implement PR checks and real-service tests, module-boundary enforcement, secret/dependency/image scans, image build/publish, SBOM/provenance and immutable release identity. Add staging deployment contract, single migration job, smoke gates, environment protection, least-privilege credentials and rollout/rollback procedures. Add initial metrics/traces, connection budgets and basic k6 baseline/burst scripts.

Exit: a deliberate broken type/test/migration/security gate fails CI; trusted build produces a runnable digest. Demonstrate staging promotion/rollback when host access exists; record external-access gaps without claiming deployed CD. Local/container CI and deployment manifests can proceed independently.

Execution override: the exit checks above are retained for later verification. Do not run them automatically to close implementation. PR CI is build/static-only; full verification requires explicit `run_tests=true`. Release/staging activation remains dormant. The current M1 closeout does not claim these exit checks passed.

## M2 - Identity, accounts and API security

Status: **backend implementation present, acceptance pending**. Identity/accounts modules, 24 API operations, request/error/reserved-event contracts, local OTP delivery, session/refresh security, TOTP/recovery, profile/saved places, audit and shared quotas are implemented. Eight new tables were migrated to local `zipp_dev` on 2026-11-12. Build/static checks passed; no tests/scans or M2 API startup were run. [Setup/design](M2_IDENTITY_ACCOUNTS.md), [ADR 0004](adr/0004-m2-identity-and-account-security.md) and [evidence/remaining gates](M2_VERIFICATION.md) record the limits. Full HTTP/Redis acceptance coverage and mobile integration remain open; this is not verified M2 completion.

Depends on M0-M1. Define OpenAPI/error/event contracts and mobile mappings. Build signup, OTP, reset, login, refresh rotation/revocation, 2FA and recovery codes, profile/saved places, resource ownership and shared rate limiting. Implement validated token purposes, cryptographic challenges and durable attempts. Test multi-instance limiter behavior and Redis outage policy. Integrate mobile identity through explicit adapters when backend contracts pass.

Exit: authenticated account flow works; wrong/replayed/expired credentials, token purpose confusion, refresh reuse, enumeration, unrelated-account access and quota bypass are tested. Secure mobile token persistence is required for integration, not API-only completion.

## M3 - Financial domain and payment attempts

Status: **backend implementation present; financial acceptance pending**. Wallet/ledger/reservation rules, persistent request identities/expiry, local payment attempts, withdrawal approval, owned history/status, outbox/worker recovery, error mappings and finance reconciliation are implemented. Nine tables were added to identified local `zipp_dev` on 2026-11-12; no tests/scans or M3 service startup ran. Read [finance guide](M3_FINANCE.md), [evidence/open gates](M3_VERIFICATION.md), [ADR 0006](adr/0006-m3-ledger-and-payment-execution.md) and [financial reliability](FINANCIAL_RELIABILITY.md). Real provider and mobile integration remain deferred; this is not verified M3 completion.

Depends on M2. Specify balanced ledger/reservations with worked examples and conservation properties, exact XAF serialization, transaction context and lock strategy, persistent idempotency, outbox and bounded workers. Build mock top-up/payout adapters, history, refunds and withdrawal reservation/finance approval. No real provider credit path yet.

Exit: real PostgreSQL concurrent/replayed operations cannot overspend, double post/refund/capture/payout or lose holds. Outbox recovery and property tests pass; financial examples reconcile exactly.

## M4 - Driver operations, uploads and pricing

Status: **backend implementation present; runtime/security/native acceptance pending**. Driver applications/vehicle/private document intents, independent admin review/history, revision/resubmission/suspension, identity-owned DRIVER roles, bounded HTTP location epochs/freshness, immutable pricing versions, local routing fixture and expiring owned quotes are implemented. Eight tables and explicitly user-authorized development fare policies were applied to identified local `zipp_dev` on 2026-11-12 (26 application tables total). Real private object storage/scanning, arbitrary road routing and native/realtime tracking remain gated future work. No tests/scans/runtime flows ran; see [M4 guide](M4_DRIVERS_PRICING.md), [evidence/open gates](M4_VERIFICATION.md) and [ADR 0007](adr/0007-m4-driver-documents-location-and-pricing.md). This is not verified M4 completion.

Depends on M2-M3. Build applications, vehicle/documents, private storage, verification/resubmission, suspension, presence/location freshness, server route adapter, service areas, expiring quotes, night rates, commission/cancellation policy and pricing versions. Record product PIN/class/contact decisions.

Exit: only approved, eligible drivers can go online; forged client price/distance and expired/foreign quote are rejected; uploads and route/timezone/rounding cases pass tests.

## M5 - Ride booking and dispatch

Status: **backend implementation present; runtime/security/race/native acceptance pending** as of 2026-11-13. Booking/quote/hold atomicity, bounded dispatch offers/radii, shared ride/delivery driver slots, acceptance rechecks, lifecycle/PIN/cancellation/settlement, partial capture/refunds, history/receipt/rating/disputes, persisted event/task recovery and participant REST tracking are implemented. Nine tables plus capture metadata were applied to identified local `zipp_dev` (35 application tables total). Tests are written but unrun; native map, Socket.IO/geo fanout and provider acceptance remain open. See [M5 guide](M5_RIDES_DISPATCH.md), [evidence/open gates](M5_VERIFICATION.md) and [ADR 0008](adr/0008-m5-booking-assignment-and-ride-lifecycle.md). No verified-complete or capacity claim.

Tracking work begins in M4 with the [tracking/calling contract](LIVE_TRACKING_AND_CALLS.md), including location permission/session/freshness rules and native transport compatibility. M5 acceptance includes real authorized driver updates, stale location UI and REST reconnect recovery in addition to job state recovery.

Depends on M3-M4. Build booking+hold atomicity, eligible offers, decline/timeout/radius expansion, shared active assignment, no-driver release, arrived/start/complete policies, PIN completion, cancel/dispute and settlement. Persist active-job snapshot, history, receipts/ratings and authorized events. Integrate the existing ride UI without importing its sample money/driver assumptions.

Exit: full ride flow demonstrated; two-driver/one-job and one-driver/two-job races are rejected, including cross-delivery eligibility; complete/cancel and duplicate completion cannot corrupt money. Crash/reconnect recovery verified.

## M6 - Delivery lifecycle

Status: **backend and opt-in mobile API implementation present; runtime/security/race/native acceptance pending** as of 2026-11-14. Booking/photo/quote/hold, shared courier slots, custody proofs, cancellation/issues/reviewed returns/refunds, suspended-custodian return, contacts, REST recovery and restricted tracking are implemented. Both M6 migrations were applied to identified local `zipp_dev`; marker `m6`, 45 application tables. Tracking credentials are client-generated and registration returns metadata only. The mobile API flow connects authentication, server booking/status/receipt, courier foreground actions and tracking sharing; it remains opt-in and unverified on devices. Invalid shared-job test fixtures were replaced and receiving/contact/suspension/photo/HTTP/mobile cases were written, not executed. See [guide](M6_DELIVERIES.md), [mobile/runbook](M6_MOBILE_INTEGRATION.md), [evidence](M6_VERIFICATION.md) and [ADR 0010](adr/0010-m6-completion-and-mobile-contracts.md). No verified-complete, production or capacity claim.

Depends on M5. Reuse shared financial/assignment components (their runtime gates remain pending); add sending/receiving contacts, package/photo, Standard/Express quotes, pickup/transit/arrival/PIN handover, rating/receipt, secure tracking capability, cancellation before collection and support-controlled returns/disputes afterward. Integrate delivery UI contracts.

Exit: both perspectives work; invalid PIN, unreachable recipient, post-pickup cancellation, duplicate settlement and unauthorized tracking access have tested behavior.

## M7 - Realtime, calling, chat, notifications and operations

Status (2026-11-21): **in progress**. M7.1 private streams/shared admission and opt-in foreground delivery adapter, M7.2 backend chat/support, M7.3 local devices/notifications, and M7.4 local call-control/signaling foundation source are present. REST contracts total 129; source schema defines 58 application tables. All three M7 migrations remain unapplied here; last identified local evidence is 45/base `m6`, with separate `communications=m7_2`, `notifications=m7_3` and `calling=m7_4` markers gated on enablement. Tests are written but unrun. No new service/container/SDK/provider; default-off flags. Local call acceptance is CONNECTING with no audio/media/TURN/native ringing or CONNECTED claim. Mobile communications/notifications, actual push/media/native calling and broader staff operations remain pending. No measured capacity/security claim. See [M7 guide](M7_REALTIME.md), [chat/support](M7_CHAT_SUPPORT.md), [notifications](M7_NOTIFICATIONS.md), [local calling](M7_CALLING.md), [evidence](M7_VERIFICATION.md) and ADRs [0011](adr/0011-m7-participant-live-stream.md), [0012](adr/0012-m7-chat-and-support-tickets.md), [0013](adr/0013-m7-notification-devices-and-durable-delivery.md), [0014](adr/0014-m7-call-control-and-ephemeral-signaling.md).

Depends on M5-M6; essential authorized realtime begins in earlier flows. Finish multi-instance adapter/transport policy, bounded fanout and client resync. Add persisted chat/tickets, push delivery retries, device ownership, admin/support/finance controls, reviewable fraud flags, reconciliation/reporting and audited adjustment/override tools.

M7 also includes the dedicated `calling` feature: provider/self-hosted media ADR, native compatibility spike, atomic device answer/session lifecycle, authenticated bounded signaling, short-lived relay credentials, push/OS incoming-call integration and failure tests. Chat completion alone cannot pass the calling gate. Keep calling disabled until its platform/media checks pass.

Exit: unrelated users cannot subscribe/send/view records; revoked sessions lose access; support cannot perform finance-only operations; conversations and active jobs recover across replica restarts. Calling has independent session/native/media acceptance evidence; unverified calling remains disabled and pending.

## M8 - Actual provider sandboxes

Depends on M3 and operational support from M7. Integrate selected MTN/Orange, SMS, routing/storage/push providers with verified current contracts, scoped secrets, HTTPS callbacks, timeouts/idempotency/status queries and reconciliation. Keep pending ambiguous outcomes and spending/provider quotas explicit.

Exit: provider-confirmed top-up, payout and OTP evidence; duplicate/delayed/forged/mismatched callbacks and paid-not-credited recovery handled without duplicate effects. No live-payment enablement implied.

## M9 - Capacity, recovery and pilot readiness

Depends on prior gates. Execute the full 1,000-user/socket, HTTP arrival-rate, burst, soak and failure tests in [CAPACITY.md](CAPACITY.md). Test maximum replica pool budgets, overload admission, queue recovery, backup/PITR restore, rolling migration and compatible image rollback. Validate measured performance, alerts, runbooks, operational owners and secrets rotation.

Exit: release report records workload, hardware, bottlenecks, results and recovery evidence. Targets must pass or scope/resources must be changed explicitly. A container build or user-count assertion cannot pass this gate.

M9 additionally requires the independent concurrent-call/forced-relay benchmark and Android/iOS background tracking/calling scenarios in [LIVE_TRACKING_AND_CALLS.md](LIVE_TRACKING_AND_CALLS.md). API/socket load tests alone cannot prove media quality or background behavior.

## First implementation batch

M0 only: new `backend/` scaffold and locked version ADR, strict rules, API/worker entry points, Prisma initial schema/migration conventions, Docker/Compose dependency isolation, safe config/logging/health/shutdown, meaningful smoke tests and repeatable commands. M1 follows with the actual pipeline and deployment wiring. Real domain/provider implementation begins after foundation gates.

## Evidence tracking

Each task records requirement, owner, status (pending/in progress/verified/blocked), dependency, files, contract/schema impact, tests/output, demo and remaining risks. Mark verified only with actual evidence. External deployment/provider access may be pending while local scaffolding/tests proceed. Do not silently weaken quality/security/load thresholds to make a milestone pass.
