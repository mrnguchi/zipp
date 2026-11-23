# M3 implementation and verification evidence

Updated 2026-11-12. **Backend implementation present; runtime/security/race verification pending on command.** This is not verified M3 completion. The user's local-first/no-tests instruction remains in force.

## Implemented source

- Cohesive finance feature with pure exact-XAF/commission/refund rules, wallet/reservation operations, payment requests, persistent idempotency, provider port and explicit local mock.
- Nine new SQL tables; constraints for balance bounds/reservation totals/balanced ledger, trigger-maintained posted balances, immutable posted/request/reference privileges and meaningful mapped names.
- Top-up and withdrawal attempts, independent finance approval/rejection, current session/role/recent-MFA mutation checks, owned balance/history/status and bounded chronological pagination.
- Database outbox, BullMQ relay/consumer in the existing worker, leases, bounded retry/review and reference-preserving reconciliation; pending/unknown outcomes do not release payout holds.
- Safe central business/HTTP error mapping and expired-key recovery fields. Account-deletion guard prevents stranding balances or unresolved operations.
- API contracts, configuration examples, worked examples and [local/recovery guide](M3_FINANCE.md). No mobile edits or real provider implementation.

## Checks actually performed

Prisma 7.10.1 client generation and offline migration SQL generation succeeded. Build/contracts generation, strict typecheck (including test sources), lint, formatting, module-boundary and workflow static checks passed on 2026-11-12. Local document-link inspection passed. Generated OpenAPI contains 33 operations (nine new finance operations), and the Prisma schema contains 18 models. Compilation does not verify financial behavior. No dependency/image/package upgrade or new service was introduced.

The migration target was identified from the ignored migration URL (127.0.0.1:55432, `zipp_dev`, `zipp_owner`) and PostgreSQL `current_database()/current_user` plus existing migration names before mutation. `npm run prisma:migrate:deploy` successfully applied `20261112000000_financial_foundation` on 2026-11-12. No reset, seed, sample credit or test-database modification occurred. The migration adds two zero-balance system accounts and advances readiness to `m3`; applying SQL is not a negative-constraint or race test.

Payment simulation was not enabled. API/worker M3 startup, Docker rebuild, remote workflow runs, hosting, provider calls and payments were not performed. Existing ignored secrets were not printed or copied. All application/database fixtures below are written source only.

## Tests written, not executed

- Pure amount bounds, reserved-funds admission, commission conservation and cumulative partial-refund rounding; strict transport fields and production mock rejection.
- Isolated `zipp_test` integration sources for concurrent identical keys/single credit, changed-input conflict, expired-key identity retention, concurrent overspending, rejection releasing funds, ownership/current-session/MFA/independent approval, capture/replay/partial refunds, ambiguous payout status recovery and runtime balance/unbalanced-ledger rejection.
- Existing foundation test source now expects the `m3` schema marker. No Jest runner, HTTP/manual scenario, deliberate failure probe, scan or load generator ran.

## Remaining gates

1. On explicit command, migrate an identified isolated test database and run unit/integration/HTTP suites. Add full HTTP error/retry/authorization/expiry and finance review/reconciliation coverage; written source is not full acceptance coverage.
2. Exercise real PostgreSQL deferred triggers, immutability/privileges, conflicting multi-wallet transactions, rollback/commit ambiguity, partial refund races and account closure against incoming/pending payments. Confirm actual Prisma driver error mapping and bounded retry semantics.
3. Exercise multiple workers/API replicas, expired leases, queue loss, worker crash before/after provider result, database/Redis outages, eight-attempt review and reconciliation. The local mock cannot establish real-provider exactly-once effects.
4. Review query plans/history indexes, connection budgets, queue pressure and marker/image compatibility; execute authorized load/recovery reports before capacity claims.
5. Verify critical branch coverage >=90%, overall >=80%, dependency/image/security checks, logs and safe error contracts. No earlier milestone coverage percentage applies to M3.
6. Finish retention/archive/operator recovery policy, real provider contracts (M8), product commission/limits, recipient-insufficient-funds refund procedures and native mobile integration before pilot. No automatic destructive cleanup or manual force-credit shortcut is provided.

See [ADR 0006](adr/0006-m3-ledger-and-payment-execution.md) for versions/references/decisions and [financial reliability](FINANCIAL_RELIABILITY.md) for required network/expiry/error rules. M4 implementation is the next roadmap phase; outstanding M2/M3 verification remains mandatory before verified-complete/release claims.
