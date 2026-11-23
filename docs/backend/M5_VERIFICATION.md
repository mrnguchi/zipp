# M5 implementation and verification evidence

Updated 2026-11-13. **Backend source/local development migration present; runtime/security/race/native verification pending on command.** No tests, scans, load generators or manual API/failure scenarios ran. Earlier M2-M4 gates remain open.

## Implemented source

Shared jobs/active assignment facade with unique driver/job constraints; ride booking+quote consumption+wallet hold+request/event/task transaction; bounded radius offers, independent server eligibility recheck and first-commit assignment; replay/conflict/expiry handling; arrived/start/completion with current GPS and customer-only cryptographic PIN; durable failed-proof limits; completion/cancellation/partial-capture/refund consistency; receipts/history/ratings/disputes; reasoned recent-MFA ADMIN recovery; participant REST event/snapshot/tracking recovery; existing BullMQ worker relay with persisted leases/review states. Drivers block occupied offline/vehicle edits, and account closure checks active jobs. See [guide/runbook](M5_RIDES_DISPATCH.md) and [ADR 0008](adr/0008-m5-booking-assignment-and-ride-lifecycle.md).

Nine new tables bring the Prisma schema to 35 application models/tables. Fund reservations now distinguish original held amount from actual captured amount. Ride events/request identities/ratings are append-only under app grants; job/ride/assignment and event/version consistency have deferred constraints. Schema application does not prove these invariants under load or races.

No new package/image/service was introduced; versions/lockfile unchanged. M4 development fares, local routing/storage and M3 mock-payment limitations remain. REST recovery is implemented source; no full Socket.IO/native live-map integration or delivery lifecycle is claimed.

## Actual allowed work

Prisma 7.10.1 client generation and offline SQL diff generation succeeded. Build/API contract generation, strict typecheck (including test sources), lint, format, module-boundary and workflow static checks passed on 2026-11-13. Lint found and corrected unused initial assignments and a test-double parameter. Document links and OpenAPI component references passed static inspection. Generated OpenAPI contains 70 operations (19 new ride operations), plus generated ride event/work schemas; Prisma contains 35 models. Compilation/source inspection does not verify runtime financial, assignment or security behavior.

Before mutation, ignored migration URL was checked without credentials: loopback 55432, `zipp_dev`, `zipp_owner`. Docker/PostgreSQL identity and four previously applied migration names matched. `npm run prisma:migrate:deploy` successfully applied `20261113000000_rides_dispatch` on 2026-11-13. No resets, customer/driver seeds, credit operations, isolated test-DB changes or test fixture execution occurred. Full pre-M5 captures receive captured-amount metadata; posted ledger balances/history are unchanged by that backfill.

Rides flag was not enabled. No M5 API/worker boot, Docker rebuild, offer/booking/GPS/PIN manual flow, runtime privilege/race probe, provider call, native/frontend edit, remote workflow, paid service or hosting was performed. Existing ignored keys/configuration were not printed or copied.

## Tests written, not executed

- Domain/schema source checks for proximity/wave budgets, terminal states, malformed stored area, client fare/assignment injection, completion/rating/work payload bounds and production/disabled config.
- Isolated `zipp_test` integration source for insufficient-funds quote rollback, two eligible drivers/one ride, one driver/two offered rides, shared delivery exclusion and retry, stale queued work, expired search release, unrelated tracking access, cancellation partial capture/full reversal, durable PIN failures and completion versus independent dispute release. Successful completion replay checks one capture.
- These use prevalidated local document/location fixtures and an admission double to isolate PostgreSQL invariants; they do not verify storage, native GPS, provider behavior or Redis admission. No suite/fixture was invoked. Existing M4 fixture constructors and foundation schema-marker expectation were updated for new dependencies/marker.

## Remaining acceptance work

1. On explicit command, identify/migrate isolated test resources and execute suites. Add/exercise full HTTP authentication/roles/ownership/error/status/expiry/PIN/header/resync and cancellation/refund contracts; written source is not complete M5 acceptance coverage.
2. Verify actual PostgreSQL deferred trigger behavior and grants, unique assignment across ride/delivery, stale assignment/timeout tasks, claim/close races, partial capture/refund rounding, quote rollback, complete/cancel/refund races and known driver error classification/retry limits. No source-review statement substitutes for a real-service report.
3. Verify multiple API/workers, queue loss/restart, expired leases, offline/delayed responses, dispatch review recovery, Redis admission failure, event ordering/resync and snapshot privacy after reassignment/closure. Current M5 has no reassignment algorithm or automatic accepted-job timeout; support resolution is explicit.
4. Integrate/verify native mobile booking, secure auth, PIN presentation, actual background location/map stale UI and reconnect. Complete Socket.IO/Redis geo/presence/fanout in their planned tracking/realtime slice; REST polling does not certify a native live map.
5. Approve commercial fare/cancellation/service-area/arrival policies and real road/storage/payment providers. Verify identity digest rotation against pending codes/replay fingerprints, refund recipient-insufficient-funds procedures, review permissions/reasons and location/event/operation retention before pilot.
6. Verify >=90% critical and >=80% overall branch coverage, authorized security/image/dependency checks, query plans/candidate indexes, pool/queue budgets and burst/recovery reports. No 1,000-user/security/availability assertion or earlier milestone coverage applies to this new code.

M6 delivery lifecycle is the next implementation milestone. M5 must not be called verified complete or production-ready until required acceptance evidence and mobile/provider scope are resolved.
