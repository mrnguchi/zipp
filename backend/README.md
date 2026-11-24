# Zipp backend

2026-11-24 calling continuation: [temporary relay credentials](../docs/backend/M7_RELAY_CREDENTIALS.md) are implemented behind an API-only default-off flag; actual issuance/relay/native/tests remain unrun. Read the runbook before configuring the prepared private key and optional Compose override; do not share relay secret configuration with the worker. The user requires normal ongoing calls to end through participant hang-up without a fixed conversation cutoff; ongoing media/renewal/reconnect implementation is still pending. No actual .env, migrations or services changed in this pass.

2026-11-23 M7 continuation: API-only `OPERATIONS_ENABLED=false` adds guarded staff cases, summaries/account controls and a page-scoped finance report. Source schema 61 tables, REST contracts 138 operations, all four M7 migrations unapplied. [Operations guide](../docs/backend/M7_OPERATIONS.md), [completion checklist](../docs/backend/M7_COMPLETION_CHECKLIST.md) and [evidence](../docs/backend/M7_VERIFICATION.md) distinguish source/build evidence from pending runtime/media/native acceptance. No tests or migrations executed; configured local DB could not connect and Docker engine was unavailable. M8 has not started.

Fresh NestJS API and independent BullMQ worker. No legacy source/schema was imported. M0 is verified; M1 implementation is complete with verification pending on command. **M2 backend implementation is present:** identity, sessions, OTP/TOTP/recovery, profiles, saved places and shared API quotas. Runtime/security verification and mobile integration remain pending. See [M2 setup and contracts](../docs/backend/M2_IDENTITY_ACCOUNTS.md) and [actual evidence](../docs/backend/M2_VERIFICATION.md). Real payment providers, booking and full tracking/calling remain later milestones. Hosting is deferred until the whole system is complete and verified; [delivery workflows](../docs/backend/DELIVERY_RUNBOOK.md) remain dormant.

Architecture and rules: [development pack](../docs/backend/README.md). Version and source evidence: [M0 ADR](../docs/backend/adr/0001-m0-foundation.md).

M3 financial backend source is now present: exact-XAF ledger/reservations, top-up/withdrawal attempts, finance approval, persistent idempotency and outbox/worker recovery. Nine new tables were migrated to local `zipp_dev` on 2026-11-12, bringing that milestone to 18 application tables. The subsequent M4 migration brings the current schema to 26 tables and readiness marker `m4`. Payment simulation remains disabled by default; no real provider is connected. See [finance setup/API/recovery](../docs/backend/M3_FINANCE.md) and [M3 evidence](../docs/backend/M3_VERIFICATION.md). M3 runtime/race/security tests and mobile wallet integration are pending on command.

M7 is in progress: private participant live streams are implemented behind `REALTIME_ENABLED=false`, with current session/job authorization and opt-in foreground delivery mobile integration. [M7.2 chat/support](../docs/backend/M7_CHAT_SUPPORT.md) adds backend source and an unapplied five-table migration: 50 application tables defined, last identified applied local evidence still 45/base `m6`. Enabled communications requires its separate `communications=m7_2` marker; `COMMUNICATIONS_ENABLED=false` remains the default. No new packages/services are added by M7.2. Read [M7 runbook](../docs/backend/M7_REALTIME.md) and [evidence](../docs/backend/M7_VERIFICATION.md). Chat/support mobile integration, calling, push/device and broader staff operations remain pending; tests/runtime/native/load verification await command.

## Requirements

M7.4 adds [local call control and encrypted ephemeral signaling](../docs/backend/M7_CALLING.md), original-participant recovery, first-device acceptance and an optional metadata reaper in the existing worker. Nine more REST operations bring generated contracts to 129; source has 58 application tables. All three M7 migrations remain unapplied here; last identified local applied evidence remains 45/base `m6`. `CALLING_ENABLED=false`, `CALLING_REAPER_ENABLED=false`; no media provider, TURN credentials, native incoming calls or CONNECTED audio state. Calling and M7 remain incomplete pending runtime/native/media acceptance on command.

M7.3 adds [private devices and generic notifications](../docs/backend/M7_NOTIFICATIONS.md), transactional communication intents and optional local capture in the existing worker. Five additional API operations bring REST contracts to 120. Four more table definitions bring source schema to 54; both M7 migration files remain unapplied here and last identified local evidence is 45/base `m6`. `NOTIFICATIONS_ENABLED=false` and worker `NOTIFICATION_DISPATCH_ENABLED=false` remain default. Enabled feature requires separate `notifications=m7_3`/`communications=m7_2` markers and a dedicated notification data key, without API identity keys in worker. No actual push provider/native delivery or test execution is claimed. See [M7 evidence](../docs/backend/M7_VERIFICATION.md).

M6 adds delivery booking/photo/hold atomicity, custody lifecycle with separate contact proofs, returns/refunds and restricted tracking. Ten new tables bring current application tables to 45. The migration sets readiness marker `m6`, and the API now requires it, so run `npm run prisma:migrate:deploy` against the identified local `zipp_dev` before booting. Both M6 migrations, including `20261114000000_m6_completion`, were applied to identified local `zipp_dev` on 2026-11-14 (marker `m6`, 45 application tables). `DELIVERIES_ENABLED=false` and `DELIVERY_MEDIA_ENABLED=false` remain the defaults. `npm run delivery:code -- <requestId>` reads a local development code on explicit invocation only. Opt-in mobile delivery/authentication source is connected; see [mobile setup/recovery](../docs/backend/M6_MOBILE_INTEGRATION.md). Tracking registration accepts a client-generated credential and returns metadata only. Read [M6 API/flags/custody](../docs/backend/M6_DELIVERIES.md) and [M6 evidence](../docs/backend/M6_VERIFICATION.md). No tests, API/worker runs or manual flows were executed for M6.

M5 adds booking/dispatch/lifecycle source and shared RIDE/DELIVERY assignment protection. At M5, nine new tables brought that historical schema to 35 tables and marker `m5`; M6 above is the current schema. `RIDES_ENABLED=false` remains the default. Read [M5 API/flags/recovery](../docs/backend/M5_RIDES_DISPATCH.md) and [M5 evidence](../docs/backend/M5_VERIFICATION.md). No tests, API/worker restart, native integration or real provider flow was performed for M5.

M4 adds driver applications/review, private local upload/download, availability/location intake and versioned sample pricing with two-minute quotes. Its eight-table migration was applied to local `zipp_dev` on 2026-11-12. Adapters remain disabled until explicitly enabled for local development. Read [M4 setup/API/limitations](../docs/backend/M4_DRIVERS_PRICING.md) and [M4 evidence](../docs/backend/M4_VERIFICATION.md). No real road provider/storage scanner/native tracking or runtime verification is claimed.

- Node 24.18.0, npm 11 and Docker Compose >= 2.24.4 with the Linux engine running.
- Available loopback ports: development 3000/55432/56379/56380; isolated tests 3100/55433/56381/56382.
- Network access for pinned image/dependency/Prisma engine downloads on a clean build.

## Start all local services

From `backend/`:

```powershell
npm ci
npm run auth:setup
npm run prisma:generate
npm run services:up
```

Compose builds the shared API/worker image, initializes PostgreSQL roles, applies the included migration once, and waits for dependency health. Runtime uses a restricted `zipp_app` database role; only the migration container receives owner credentials. This is local/test configuration with clearly marked dummy passwords, not a production deployment template. Postgres and Redis host ports bind to loopback; worker management is container-private.

- API liveness: `http://localhost:3000/health/live`.
- API readiness: `http://localhost:3000/health/ready` (requires migrated database and both Redis services).
- Logs: `docker compose -f ../infra/compose/compose.yaml logs -f api worker`.
- Stop: `npm run services:down` (retains named database/queue volumes).

Database initialization scripts run only on a fresh data volume. Do not change credentials/roles expecting an existing volume to be reinitialized. Do not remove volumes to fix an unidentified database; investigate and migrate deliberately. No scripts automatically reset data.

## Run locally outside the application containers

Run `npm run auth:setup` to create/preserve local identity keys in ignored `.env` and create `.env.migrate` if missing. Review the local database target before migration: `127.0.0.1:55432/zipp_dev`. Keep migration-owner credentials in `.env.migrate`, separate from runtime `.env`. Start dependencies and apply the additive migrations:

```powershell
docker compose -f ../infra/compose/compose.yaml up -d postgres redis-queue redis-cache
npm run prisma:migrate:deploy
npm run prisma:generate
npm run build
npm start
```

Run `npm run start:worker` in a separate terminal. Startup loads `.env`; migration commands load `MIGRATION_DATABASE_URL` from `.env.migrate`. Schema validation and client generation work without live services or secrets. For watch mode, run `npm run build:watch` and `npm run dev` in separate terminals after an initial build. Regenerate OpenAPI with `npm run build` after contract edits; the watch compiler alone does not regenerate contracts.

## Checks and isolated service tests

The user currently authorizes implementation/builds only. The commands below are reference commands for a later explicit testing instruction, not phase-closeout steps to run automatically. `npm run build` compiles without running tests. Avoid `npm run check` until testing is authorized because it includes test execution. PR CI uses separate static/build commands; manual CI defaults to `run_tests=false`.

```powershell
npm run check
npm run services:test
npm run services:test:down
```

`check` validates/generates Prisma, checks strict types/lint/format, runs unit + HTTP E2E tests with dependency doubles, and builds production JavaScript. Real integration verification is separate and mandatory: `services:test` uses project `zipp-m0-test`, separate volumes/ports/database, real PostgreSQL/Redis, a migration job, API, worker and disposable test runner. It tests applied schema, restricted runtime DDL, Redis access, a job processed by the independent worker, and both readiness endpoints. Without an explicitly configured isolated test environment, integration tests fail rather than silently skip.

Jest runs precompiled ESM with Node's experimental VM modules support; its warning is expected and not suppressed. No runtime transpiler is needed. Source and tests are strict-checked before execution.

To inspect configuration without starting anything:

```powershell
docker compose -f ../infra/compose/compose.yaml config --quiet
docker compose -p zipp-m0-test -f ../infra/compose/compose.yaml -f ../infra/compose/compose.test.yaml config --quiet
```

## Data and operational boundaries

The schema contains `platform_metadata` and eight M2 identity/account tables, plus Prisma's migration bookkeeping. The M2 migration was applied to local `zipp_dev` on 2026-11-12; other databases need their own identified migration step. Those counts describe earlier milestones. Current readiness requires marker `m6` after both M6 migrations (45 application tables). Migrations grant app permissions explicitly; runtime cannot modify schema or read/update/delete the security audit. No global table grants or runtime schema-owner credentials.

API and worker use bounded PostgreSQL pools and separate queue/cache Redis clients. Queue Redis persists with AOF and noeviction; cache is disposable and may evict. Readiness fails if required dependencies are unavailable; liveness stays independent of them. API logging excludes raw URLs, bodies, headers and connection errors; responses contain safe errors and generated request IDs. Both processes handle SIGTERM and release connections; Compose gives a 15 s drain window.

Production config rejects dummy local passwords and requires verified PostgreSQL TLS plus rediss. This is a configuration guard, not proof of production security/availability. Development/test Compose and an optional local telemetry override are provided. The staging Docker-host template is a reference requiring host selection and secure dependencies; no live environment is configured. Object storage remains M4 work.

Do not expose the infrastructure probe queue as a public business endpoint. M1 provides pipeline/operational tooling; M2 provides identity/account source and API contracts. Development OTP delivery uses a private local mailbox; production rejects that adapter until a real provider is implemented. No M2 tests or scans have been run. See [M0 verification](../docs/backend/M0_VERIFICATION.md), [M1 evidence](../docs/backend/M1_VERIFICATION.md) and [M2 evidence](../docs/backend/M2_VERIFICATION.md) for each milestone's actual limits.
