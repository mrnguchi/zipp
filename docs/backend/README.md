# Zipp backend development contract

2026-11-23 M8 update: user authorized starting M8 despite pending M7 work. Smobilpay selected; sandbox account and SMS selection pending. Read [M8 steps](M8_PROVIDERS.md) and [provider ADR](adr/0017-m8-smobilpay-provider-selection.md). Earlier M8 hold notes are historical. Source/schema/runtime unchanged by this planning slice.

2026-11-23 continuation: [staff operations](M7_OPERATIONS.md) and [foreground mobile communication/inbox](M7_MOBILE_COMMUNICATIONS.md) source are present (61 source tables, 138 REST operations, four unapplied M7 migrations). Self-hosted WebRTC/TURN chosen in [ADR 0016](adr/0016-m7-self-hosted-calling-direction.md); real push/audio/native work remains open. Follow [M7 completion checklist](M7_COMPLETION_CHECKLIST.md) and keep M8 on hold. No tests/migrations ran; local DB/Docker engine unavailable.

Updated 2026-11-20. Direction: a completely new backend, pipeline, database schema, migrations, container setup, and test suite in `backend/` within this workspace.

The earlier legacy-backend stabilization plan is superseded. The separate backend remains untouched reference material. Existing mobile screens and product requirements inform the new contracts; legacy code is not the implementation baseline.

## Read in this order

| Document | Responsibility |
| --- | --- |
| [Plan](PLAN.md) | Scope, decisions, ownership, and implementation direction |
| [Architecture](ARCHITECTURE.md) | Components, folder structure, module contracts, transactions, and data design |
| [Live tracking and calls](LIVE_TRACKING_AND_CALLS.md) | GPS/map flow, background behavior, WebRTC signaling/media, native calls, privacy, recovery and media tests |
| [Dependency policy](DEPENDENCY_POLICY.md) | Mandatory official-documentation research, package compatibility checks and evidence before integration/install/upgrade |
| [M0 verification](M0_VERIFICATION.md) | Current foundation checks, results and remaining gates |
| [M0 version ADR](adr/0001-m0-foundation.md) | Chosen versions, native runtime requirements and primary references |
| [M2 identity/accounts](M2_IDENTITY_ACCOUNTS.md) | Local auth setup, API/mobile mappings, quotas and recovery behavior |
| [M2 evidence](M2_VERIFICATION.md) | Applied development schema, build/static results and unrun acceptance gates |
| [Financial reliability](FINANCIAL_RELIABILITY.md) | M3 network recovery, idempotency expiry, error boundaries and meaningful names |
| [M3 finance guide](M3_FINANCE.md) | Wallet/ledger rules, local simulation, API contracts and recovery runbook |
| [M3 evidence](M3_VERIFICATION.md) | Development migration/build results and unrun financial acceptance gates |
| [M4 drivers/pricing](M4_DRIVERS_PRICING.md) | Driver review/private uploads, location intake, sample fares and quote contracts |
| [M4 evidence](M4_VERIFICATION.md) | Local schema/build results and unrun storage/location/pricing acceptance gates |
| [M5 rides/dispatch](M5_RIDES_DISPATCH.md) | Booking/hold atomicity, exclusive assignment, lifecycle/PIN, receipts and recovery |
| [M5 evidence](M5_VERIFICATION.md) | Local M5 migration/build results and unrun race/runtime/native gates |
| [M6 deliveries](M6_DELIVERIES.md) | Delivery booking/photo/hold atomicity, custody lifecycle, contact proofs, returns and restricted tracking |
| [M6 mobile/runbook](M6_MOBILE_INTEGRATION.md) | Opt-in server delivery/authentication, native dependencies, local setup and recovery |
| [M7 realtime/runbook](M7_REALTIME.md) | Private participant live stream, shared admission, recovery and remaining communication/operations slices |
| [M7 chat/support](M7_CHAT_SUPPORT.md) | Durable participant history, support tickets, command receipts, migration and recovery |
| [M7 notifications](M7_NOTIFICATIONS.md) | Private devices/inbox, transactional intents, local capture, retry/fencing and pending native/provider gates |
| [M7 local calling](M7_CALLING.md) | Participant/session/device claims, control metadata, ephemeral signaling and pending real media/native acceptance |
| [M7 evidence](M7_VERIFICATION.md) | First-slice implementation, allowed build/static evidence and unrun acceptance gates |
| [M6 evidence](M6_VERIFICATION.md) | M6 completion-pass build/static results and unrun custody/race/runtime/native gates |
| [Engineering standards](../engineering-standards.md) | Code, comments, security, testing, and definition of done |
| [Infrastructure and delivery](INFRASTRUCTURE.md) | Docker services, CI/CD, environments, secrets, migrations, and recovery |
| [Capacity and resilience](CAPACITY.md) | 1,000+ concurrent-user workload, budgets, rate limits, scaling, and failure tests |
| [Roadmap](ROADMAP.md) | Milestones and acceptance evidence |
| [Resources](RESOURCES.md) | Official references, version policy, tools, and provider access |
| [Workspace instructions](../../AGENTS.md) | Rules future implementation sessions must follow |

## Status

M0 is verified complete with 32 passing tests at that milestone; [M0 evidence](M0_VERIFICATION.md). M1 implementation is complete with verification pending. M2 identity/accounts, M3 finance, M4 driver/pricing, M5 rides/dispatch and M6 deliveries backend source are present; runtime/security verification and mobile integration remain pending. M5's nine new tables were applied to local `zipp_dev` on 2026-11-13 (35 application tables at that milestone). Both M6 migrations were applied to identified local `zipp_dev` on 2026-11-14 (45 application tables; marker `m6`). M6 mobile API/authentication integration is implemented behind an explicit opt-in flag; device/runtime tests remain unrun. See [M2 evidence](M2_VERIFICATION.md), [M3 evidence](M3_VERIFICATION.md), [M4 evidence](M4_VERIFICATION.md), [M5 evidence](M5_VERIFICATION.md), [M6 evidence](M6_VERIFICATION.md) and [backend setup](../../backend/README.md). M7 is in progress: private live participant stream, opt-in delivery mobile adapter and backend chat/support source are present, with tests unrun. [M7.2](M7_CHAT_SUPPORT.md) adds unapplied five-table migration source (50 application tables defined; separate communications marker). M7.3 adds device/generic notification/local capture source and an unapplied four-table migration (54 total source tables); see [notifications](M7_NOTIFICATIONS.md). M7.4 adds [local call control/signaling](M7_CALLING.md) and a third unapplied four-table migration (58 source tables). Actual media/native calling, mobile communication/notification, real push, broader operations and M8-M9 remain pending. Hosting waits for complete implementation, authorized verification and explicit deployment authorization. [ADR 0003](adr/0003-local-first-manual-verification.md) keeps tests/scans opt-in and release/staging dormant; see [M1 evidence](M1_VERIFICATION.md) and [delivery runbook](DELIVERY_RUNBOOK.md). No production-security or capacity claim is established.

Numbers in capacity/rate-limit documents are initial engineering targets, not measured capacity or availability guarantees. Hosting sizing and versions are confirmed through the foundation compatibility test and benchmark.

## Product inputs

- Workspace PRD: `docs/Zipp_Detailed_PRD_Green.pdf`.
- Production SRS and supporting flow diagrams: `D:\Projects\zipp\zipp_app`.
- Existing mobile screens and local flows under `mobile/src/`.

User direction governs architecture. Product conflicts such as PIN timing, ride labels, cancellation fees, and contact fields must be recorded before implementing the affected contract. The old backend's route names and database design are not binding.
