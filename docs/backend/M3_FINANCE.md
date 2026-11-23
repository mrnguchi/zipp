# M3 wallets, payment attempts and recovery

Updated 2026-11-12. Backend source and local development migration are present; **runtime/security/race verification is pending on the user's command**. No real payment provider or mobile wallet integration is enabled. Read [financial reliability](FINANCIAL_RELIABILITY.md), [ADR 0006](adr/0006-m3-ledger-and-payment-execution.md) and [M3 evidence](M3_VERIFICATION.md).

M4 continuation: latest local readiness marker is `m4`, with 26 application tables; follow [M4 setup](M4_DRIVERS_PRICING.md) for current schema/adapters. M3-specific historical counts below describe that milestone, not a rollback target.

## Implementation and ownership

The cohesive `finance` Nest feature owns focused wallet, payment request, idempotency and execution services, pure money rules, a repository port and Prisma adapter. Its facade is the public boundary for future booking/delivery modules. Identity uses that boundary to block account deletion while funds, reservations or unresolved payment attempts remain. Ordinary account-deletion requests still retain identity/audit records.

Nine new tables: `wallet_accounts`, `ledger_transactions`, `ledger_postings`, `fund_reservations`, `financial_operations`, `idempotency_records`, `payment_attempts`, `withdrawal_requests`, `outbox_events`. Together with the nine M0/M2 application tables, the Prisma schema contains 18 application tables; migration bookkeeping is additional. Wallet accounts are created lazily during financial mutation; no wallet row reads as zero, not as a fabricated credit. Platform and clearing accounts are inserted at zero by the migration. No customer/driver/staff seed or initial user balance is created.

SQL columns use meaningful snake_case, explicit XAF units and foreign-key names. TypeScript uses camelCase fields and focused PascalCase classes. Prisma maps those names explicitly. Money is bigint internally and a decimal string over HTTP; requests accept whole positive XAF from 1 to 1,000,000,000. Account magnitude is bounded at 9,000,000,000,000 XAF. These initial code limits are engineering defaults requiring product review, not approved provider limits.

## Ledger and reservations

Each posted ledger transaction contains at least two nonzero signed postings totaling zero. A database trigger updates posted balances; the app role has no direct posted-balance update privilege. A deferred constraint requires balanced transactions. Headers carry their creating PostgreSQL transaction identity so later transactions cannot append postings to old history. App privileges prohibit updating/deleting ledger headers/postings, request identities and payment references. SQL constraints are implemented but their negative/concurrency behavior remains unverified.

Available funds = posted funds minus reserved funds. Only clearing can be negative; customer and platform accounts cannot spend reserved funds or overdraw. A deferred constraint compares reserved totals with active reservation rows. Accounts are locked in sorted UUID order before money changes; the initiating user lock precedes wallet locks. Known rolled-back deadlock/serialization conflicts have at most two retries with jitter in the shared transaction adapter. Timeouts and lost commit acknowledgements are not blindly retried internally.

Worked example, using an illustrative 10% commission that is not a selected product policy:

| Action | Customer posted / reserved / available | Other postings |
| --- | --- | --- |
| Confirm 10,000 XAF top-up | 10,000 / 0 / 10,000 | Clearing -10,000 |
| Reserve 2,000 for a booking | 10,000 / 2,000 / 8,000 | No ledger movement |
| Release without charge | 10,000 / 0 / 10,000 | No ledger movement |
| Capture instead of release | 8,000 / 0 / 8,000 | Driver +1,800; platform +200 |
| Fully refund the capture | 10,000 / 0 / 10,000 | Driver -1,800; platform -200 |

Capture and release are alternative terminal reservation transitions. Commission uses integer basis points with floor rounding; the beneficiary receives the residual. Cumulative partial refunds allocate reversals proportionally, flooring the beneficiary share and assigning the residual to platform. Repeated partial refunds cannot change the full-refund total. Refunds reference the original reservation and a stable refund key, cannot exceed the captured amount and reject if recipient/platform funds are unavailable. Such cases require a later support/finance recovery policy rather than an unauthorized overdraft.

Reservation/capture/release/refund are trusted internal facade operations requiring an active opaque transaction context. The booking caller must enforce ownership, eligibility, approved server pricing, cancellation policy and audit/reason rules; they have no public arbitrary-money endpoints. They are prepared for M5/M6 integration, not proof that booking/settlement flows already work.

## HTTP contract

All routes use `/api/v1`, authenticated bearer access, current M2 session/account checks, shared Redis limits, bounded inputs and no-store responses. OpenAPI is generated by the production build. Financial mutations require a UUID v4 `Idempotency-Key`; request bodies reject client owner, outcome, balance and role fields.

| Endpoint | Purpose / additional permission |
| --- | --- |
| GET `/wallet` | Own posted/reserved/available balance, as XAF strings |
| GET `/wallet/history` | Own immutable signed postings and transaction descriptions |
| GET `/wallet/operations` | Own payment/withdrawal operations |
| GET `/wallet/operations/{id}` | Own current operation status, including expired-key recovery |
| POST `/wallet/top-ups` | `{amountXaf:"5000"}`; persist a local simulated payment attempt |
| POST `/wallet/withdrawals` | `{amountXaf:"2000"}`; recent enrolled MFA required; reserve funds awaiting review |
| GET `/finance/withdrawals` | FINANCE/ADMIN with recent enrolled MFA; awaiting-approval requests only |
| POST `/finance/withdrawals/{id}/review` | Independent FINANCE/ADMIN reviewer, recent MFA; `{decision:"approve"|"reject",reason:...}` with 10-300 characters |
| POST `/finance/operations/{id}/reconcile` | FINANCE/ADMIN with recent MFA; reason required; re-query a REVIEW_REQUIRED operation using its existing provider reference |

List queries accept `limit` 1-50 (default 20) and UUID `cursor`. History/operations sort by created time and UUID descending. Cursors must belong to the actor's accessible collection; a removed/stale pending-review cursor returns a safe validation error and requires restarting pagination. Finance review currently lists only awaiting approval; unresolved review IDs are obtained from the operation owner's status response or restricted operator database inspection, not a full operations dashboard.

Payment mutation responses are `202` and contain `{id,operationType,status,amountXaf,currency,failureCode,createdAt,completedAt}`. They report the persisted operation, not automatic payment success. A retry can return the same operation in its newer status. Withdrawal review cannot approve the requester's own withdrawal. Approval locks and rechecks current state; competing reviews cannot both transition the same request.

## Idempotency, expiry and errors

The request scope is actor + operation type + UUID key. Canonical fingerprints cover normalized amount/currency or the target/decision/reason. A user lock serializes the scoped claim before the database unique constraint. Same input returns the existing logical operation; changed input returns `409 IDEMPOTENCY_CONFLICT`. Financial business identities add separate protection for payment posting, capture and refund effects across different request keys.

The terminal response is reconstructed from the retained operation record rather than duplicating JSON bodies. Completion persists `response_expires_at` exactly 24 hours later. Pending/awaiting/review operations have no response expiry. Expired replays return `409 IDEMPOTENCY_KEY_EXPIRED` with authorized `operationId`; use GET `/wallet/operations/{id}`. No key identities are deleted or made reusable. Current request IDs are always fresh. Staff reconciliation retrieves status through authorized operator inspection where no staff detail endpoint is yet exposed.

Domain/application `BusinessError` values map centrally to safe 400/401/403/404/409 responses; controlled dependency errors use 503, quotas 429 and malformed/oversized bodies 400/413. Unexpected errors use `500 INTERNAL_ERROR` without original SQL/provider messages. Clients keep the original financial key after disconnect/401/429/500/503 and resolve the original operation; they do not generate a new payment because a response failed. See [the full error/retry rules](FINANCIAL_RELIABILITY.md). The mapping is implemented source, not evidence that every runtime failure path passes.

## Local payment configuration

Payment simulation is **disabled by default**. To enable it deliberately for future local development, configure both API and worker through ignored `backend/.env`:

```dotenv
PAYMENTS_ENABLED=true
PAYMENT_ADAPTER=local
PAYMENT_LOCAL_OUTCOME=success
```

Do not enable/run API flows or failure simulations merely to close this implementation phase. No setting was enabled during M3 implementation. Compose forwards only these non-secret payment settings; worker receives no identity keys. Production rejects enabled local adapters. No package, service, paid resource or provider credential was added.

The outcome is server-side configuration persisted on each attempt, so changing the environment does not alter an existing attempt. `success` confirms; `failure` reports confirmed non-payment; `pending` stays unresolved; `ambiguous` simulates an unknown first response followed by confirmed status on a later attempt. This deterministic local adapter moves no real money and does not establish provider compatibility, phone ownership or external settlement. M8 must implement actual provider amount/currency/reference/authentication/status validation and retention windows.

## Worker and recovery runbook

1. The API transaction commits request identity, operation, withdrawal hold when needed, audit and outbox intent together. Top-ups queue immediately; withdrawals queue only after approval.
2. The existing worker scans up to 20 due outbox rows every two seconds and relays versioned event IDs to BullMQ `financial-payments`. Queue delivery can repeat. A PostgreSQL 30-second lease claims execution; database status/effect identities are authoritative. Queue deletion/restart cannot erase the outbox intent.
3. Worker concurrency is two per process. Producer commands time out after two seconds. Payment calls occur outside database transactions. The current mock makes no network calls; every future real adapter must implement its own bounded timeout, reference-based status recovery and safe provider deduplication before enabling it.
4. Confirmed top-ups post wallet/clearing entries once. Confirmed payouts consume the hold and post the deduction once. Confirmed payout failure releases the hold. Unknown/pending responses keep the hold and reschedule with exponential delay (capped at five minutes) plus jitter.
5. After eight unresolved attempts, mark REVIEW_REQUIRED and stop automatic work. Settlement failures after a provider result use the same bounded recovery policy; no fabricated failure or release. If PostgreSQL itself is unavailable, persisted leases/intent recover after connectivity returns. Closing a response connection never cancels the operation.
6. For review, inspect the operation ID, status, attempt reference, reservation and outbox state through a restricted operator connection. Never change posted history/balances directly or mark success from the mobile screen. Use the finance reconciliation endpoint to re-query the same reference; it records the reason/reviewer in immutable request identity and audit intent. The local always-pending scenario stays pending/review; no admin success override exists. A real provider mismatch or permanently unfunded refund needs a reviewed later operator procedure.
7. API/worker restart uses the existing image/container commands after an explicitly authorized runtime-verification step. Do not flush Redis/reset database volumes to repair pending financial work. Production adapter enablement remains M8 work.

Migration `20261112000000_financial_foundation` was applied only to identified local `zipp_dev` at loopback 55432 on 2026-11-12. Readiness now requires marker `m3`. Old M1/M2 binaries require a reviewed compatibility/forward-repair plan; no automatic down migration is provided. Test/other databases must be separately identified and migrated when their use is authorized. In pgAdmin refresh `zipp_dev > Schemas > public > Tables`.

## Open acceptance gates

Tests are written but unrun. Full HTTP flows, multi-instance locks/leases, SQL privileges/deferred constraints, queue loss/restart, provider ambiguity, response expiry and ledger conservation still need authorized execution and broader acceptance coverage. Native mobile wallet integration is deferred until verified backend contracts and explicit integration scope. No capacity, financial-security certification or production-readiness claim is established.
