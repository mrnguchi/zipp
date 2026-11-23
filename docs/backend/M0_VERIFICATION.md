# M0 verification record

Date: 2026-11-08. Owner: Zipp backend maintainers. Status: **M0 verified complete within its foundation scope**. This is not a production-readiness or capacity claim.

## Delivered

Fresh API/worker scaffold, strict TypeScript/ESM, safe startup configuration, bounded Prisma PostgreSQL pool, separate Redis clients, readiness/liveness, redacted structured logs, safe HTTP errors/request IDs, security headers, SQL migration sources, restricted local app role, isolated Compose development/test services, pinned base/service image digests and separate runtime/migration/test image stages. No legacy source/schema/secrets were imported. No Git commit or production deployment was performed.

Setup and commands: [backend README](../../backend/README.md). Versions, sources and dependency decisions: [ADR 0001](adr/0001-m0-foundation.md).

## Acceptance evidence

| Check | Result |
| --- | --- |
| Host install and dependency compatibility | Pinned install succeeded; `npm ls --depth=0` reports a valid direct dependency tree without force/legacy-peer flags |
| Schema/client | Prisma 7.10.1 validate/generate pass without live services; generated client compiles with the application |
| Aggregate `npm run check` | Pass: strict types, ESLint 10, formatting, unit tests, HTTP E2E and production TypeScript build |
| Unit suite | 23 passing cases across configuration validation, readiness/draining and credential-safe framework logging |
| HTTP E2E suite | 4 passing cases: health contract/headers, readiness, safe outage errors and absence of accidental product endpoints |
| Real-service integration | 5 passing cases in the disposable runner: schema marker via Prisma, denied runtime DDL, Redis read/write, BullMQ probe processed by separate worker, independent API/worker readiness |
| Total automated tests | **32 passed** (23 unit + 4 HTTP E2E + 5 integration) |
| Clean Linux install/build | Docker `npm ci` from lockfile, Prisma generation and TypeScript build succeed; OpenSSL/CA native requirements are included |
| Runtime image | `zipp-backend:m0`; image identity `sha256:0fb5dc37d9382a959fc1f7e6dca9a616ae489ff4a0d0c79bb866207076268551` at verification |
| Fresh database | Development `zipp_dev` initialized on a new named volume and applied `20261106000000_platform_foundation` successfully |
| Migration repeatability | Existing `zipp_test` reports no pending migrations on subsequent container startup; no reset/db-push/seed was used |
| Runtime restrictions | API/worker run as `node` with read-only roots and dropped capabilities; application role cannot create schema objects |
| Actual dependency outage | Stopped only the test cache: API liveness 200, readiness 503; restored cache: readiness 200 |
| Graceful stop | Test API/worker stopped within the 15 s grace window (about 3 s), exit 143 from SIGTERM, no OOM/forced SIGKILL |
| Connection cleanup | Test PostgreSQL reports zero remaining `zipp_app` connections after API/worker shutdown |
| Invalid startup | Isolated runtime with invalid NODE_ENV exits 1 with a safe generic diagnostic, without a network |
| Compose/docs | Development/test Compose validation and documentation relative-link/whitespace checks pass |

## Environment after verification

- Development API, worker, PostgreSQL, queue Redis and cache Redis remain healthy/running in project `zipp-dev`.
- API readiness: `http://localhost:3000/health/ready`; liveness: `http://localhost:3000/health/live`.
- Test containers/network were removed after verification; test named volumes are retained. Development volumes are separate. No unrelated services or data volumes were removed.
- Shared local image tags are `zipp-backend:m0`, `zipp-backend:m0-migrate`, and `zipp-backend:m0-test`; staging/production digest promotion is M1 work.

## Security/tooling qualifications and next milestone

Runtime-only npm audit reported zero vulnerabilities. Full tooling audit reported 20 low/moderate findings (3 low, 17 moderate), with no high/critical findings. These include development transitive glob/minimatch/deepmerge/tooling paths; remediation/upstream assessment belongs to M1 before release. Do not force-downgrade tools or add unverified broad overrides. Migration/test images retain tooling and require their own supply-chain review. This npm result is not an OS/container vulnerability scan.

Jest ESM emits its documented experimental VM-modules warning. npm also reports lifecycle-script review warnings for the known Prisma/native optional packages; runtime dependency installation disables scripts. CI script approval/supply-chain policy and final image scans remain M1 deliverables.

Scope exclusions: no CI/CD pipeline, production hosting/HA, product domain entities, authentication, distributed product rate limiting, real payments, live tracking/calls, proven load capacity, storage adapter or telemetry collector has been delivered under M0. Optional telemetry/storage profiles are intentionally deferred to M1/M4 when the real components exist. **M1 is the next pending milestone.**
