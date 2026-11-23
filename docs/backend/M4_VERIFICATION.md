# M4 implementation and verification evidence

Updated 2026-11-12. **Backend implementation present; runtime/security/race/native verification pending on command.** This is not verified M4 completion. No tests/scans/manual failure scenarios were executed.

## Implemented source

Drivers/pricing modules with explicit ports/facades, identity-owned role changes, revisioned vehicle/document submission, independent recent-MFA ADMIN review, rejection/resubmission/suspension, review history and bounded summaries/detail. Private opt-in local document storage has server UUID keys, ownership, byte/type/digest checks, upload expiry, bounded binary reads and audited attachment downloads. Availability/location epochs enforce current driver/session state, sequence, freshness, accuracy and movement bounds. Pricing has service areas, immutable versions, exact-XAF/night rules, labelled fixtures, two-minute owned quotes and an internal one-time consumption boundary. See [design/setup/runbook](M4_DRIVERS_PRICING.md) and [ADR 0007](adr/0007-m4-driver-documents-location-and-pricing.md).

The user explicitly authorized sample fares until later updates. Migration includes a clearly labelled development service area and five sample policies; routing accepts only its documented fictional endpoint pair. No arbitrary-coordinate road routing or production storage/provider integration is claimed. Adapters remain disabled by default and reject production enablement.

## Actual allowed work

No new dependency/package/image/service was added. Existing Node/Nest/Prisma/Zod/TypeScript versions and lockfile were retained. Official Node 24.18, PostgreSQL 18 and Nest references plus installed types were used. Prisma client/offline SQL generation succeeded. The CLI output-file option did not create the intended M4 file in this invocation; SQL was explicitly captured from the offline diff command and written UTF-8, then reviewed/wrapped with constraints/grants and fixtures.

Build/OpenAPI generation, strict typecheck (including test source), lint, formatting, module-boundary and workflow static checks passed on 2026-11-12. Local document-link inspection passed. OpenAPI has 51 operations and Prisma 26 application models. These are compilation/source counts, not API/security verification. The HTTP filter now also avoids writing a second response after a disconnect/partial stream; that recovery path remains unverified at runtime.

Before mutation, ignored `.env.migrate` was checked without printing credentials: loopback 55432, `zipp_dev`, `zipp_owner`. Docker/PostgreSQL identity and the three existing applied migration names matched. `npm run prisma:migrate:deploy` successfully applied `20261112010000_drivers_pricing` on 2026-11-12. No reset, sample customer/driver seed, balance credit, test-database mutation or test fixture execution occurred. Applying constraints is not proof of negative/race behavior.

No M4 API/worker startup, Docker rebuild, filesystem upload/download, location/manual quote flow, native/mobile change, provider call, monitoring startup, workflow dispatch or hosting was performed. Runtime feature flags were not enabled and ignored secrets were not printed.

## Test sources written, not run

- Exact route charge/minimum/rounding, Douala day/night boundaries, area/route budgets; missing document/vehicle eligibility, stale/offline position and implausible movement rules.
- Strict field injection, oversized/type limits, nonfinite coordinates and production local-adapter rejection.
- Isolated `zipp_test` integration sources: full document/submission/review with independent reviewer/revision checks, private document ownership/frozen upload, suspension/role removal/sequence replay, simultaneous quote retries, foreign ownership, policy replacement, one-time consumption and price-column privilege rejection. Integration document storage is a memory port double; it does not verify actual filesystem/volume safety.
- Foundation test source now expects the `m4` readiness marker. No Jest runner or deliberate negative probe was invoked.

## Open acceptance gates

1. On explicit test command, identify/migrate isolated test resources and execute suites; add full HTTP/stream interruption/length/magic/expiry/error/status and secure staff review tests. Written tests are not full M4 acceptance coverage.
2. Exercise PostgreSQL approval/location/quote/role races, stale epochs, session revocation, invalid grants/constraints, policy changes versus consumption and future booking/hold atomicity. Verify driver eligibility with future shared assignments across ride/delivery.
3. Verify non-root private volume ownership, crash/partial writes, retries, corrupted/unavailable files, bounded downloads, symlink/path behavior, orphan reconciliation and redacted logs. Add actual malware scanning/private object storage before production use; human review acknowledgement is not scanner evidence.
4. Verify native foreground/background permissions, denied/revoked access, clock/accuracy/jump tuning and reconnect. Add Redis geo/TTL/session recovery, participant tracking and resync in M5/M7. Current latest snapshot has no automatic stale-coordinate deletion; finalize retention/cleanup before pilot.
5. Replace fictional route and development fee/area assumptions with approved product/provider contracts; verify intermediate-road service-area policy, provider timeout/cache/quota, actual route/currency rounding and cancellation lifecycle. No cancellation charge occurs in M4.
6. Verify critical branch coverage >=90% and overall >=80%, authorized dependency/image/security checks, query/load/pool budgets and image/schema compatibility. No historical milestone coverage or capacity assertion applies to new code.

Mobile driver/quote integration, real providers (M8), pilot security/capacity (M9), ratings/earnings and full operations remain later scope. Outstanding M2/M3 gates remain open. M5 is the next implementation milestone after this source slice; no verified-complete/release claim is permitted until required evidence exists.
