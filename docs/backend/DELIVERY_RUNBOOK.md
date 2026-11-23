# Delivery and operations runbook

Current policy, 2026-11-11: **local implementation/builds first; tests only on command; hosting after the full system is implemented, tested and working, followed by explicit deployment authorization**. The earlier AWS ECS/Fargate answer is superseded. No cloud infrastructure, deployment credentials or live staging target is configured. See [ADR 0003](adr/0003-local-first-manual-verification.md). M1 implementation is complete; verification remains pending.

## Current build-only workflow

From `backend/`, `npm run build` compiles the application without running tests. Ordinary local services are API, worker, PostgreSQL and separate queue/cache Redis. Starting only PostgreSQL for pgAdmin does not start tests. Optional monitoring remains off unless requested; no additional service is required for daily implementation.

PR CI installs from the lockfile, generates Prisma, checks types/style/module/workflow structure and compiles. It does not call `check`, policy fixtures, failure probes, service tests, scanners or load scripts. Manual/reusable CI also defaults to build-only. After explicit authorization, manually invoke Backend CI with boolean `run_tests=true` to run the retained verification jobs. No workflow is dispatched by this document or this closeout.

## Verification commands (only after explicit authorization)

From `backend/`, run `npm ci`, `npm run check`, `npm run security:audit`, `npm run security:probe`, `npm run security:secrets` and `npm run lint:workflows`. Docker must be running for container scanners. `npm run services:test` builds API/worker/migration/test images and runs all test projects against the isolated `zipp-m0-test` PostgreSQL/Redis stack. `npm run services:test:down` stops that stack without removing its volumes.

After building, run `npm run security:image` and `npm run security:sbom`. Repeat with `ZIPP_SCAN_IMAGE=zipp-backend:local-migrate` and `ZIPP_SCAN_REPORT=migration`. Reports go to ignored `artifacts/`; never upload the exported image archives. High/critical findings fail the gate. Low/moderate npm findings remain visible and need review; a passing severity gate does not mean zero vulnerabilities.

## GitHub activation

The workflow files are local source until reviewed, committed and pushed. Before enabling releases, configure protected main with required CI jobs, restricted bypass, and reviewed workflow changes. Check the repository's Actions/package permissions and GHCR package visibility. Releases require trusted main and a successful reusable CI run. PR jobs have read-only tokens; never add deployment secrets to them.

There is no push-triggered publishing. Keep repository variables `BACKEND_RELEASES_ENABLED` and `BACKEND_STAGING_ENABLED` unset or false throughout local development. Only after the user's future release authorization, enable the relevant variable. The manual release also requires `run_tests=true` and `publish_release=true` on main; it cannot publish from a build-only verification run. Staging preparation separately requires `prepare_staging=true` and its variable on main. It prepares a bundle only. No host deployment adapter is active, and none is enabled here.

Release builds publish commit-tagged candidate runtime/migration images with BuildKit provenance and SBOM attestations. Both exact pushed digests must then pass Trivy scans. Only a successful scan creates `release.json` with schema version, commit and both immutable image references. Failed candidates may exist in the registry: their presence or tags do not authorize promotion. Use the manifest from a successful release workflow and verify its source commit, provenance, scan reports and signatures/attestations supported by the eventual deployment platform.

The manual staging workflow validates a proposed manifest and prepares files; it does not connect to a server or deploy. Input validation proves format/namespace, not that arbitrary digests passed a trusted release. An eventual deployment adapter must verify successful release provenance before promotion. Configure staging reviewers and least-privilege environment credentials when selecting the target. Actual hosted CI, publishing and promotion remain unverified until run there.

## Host selection and deployment prerequisites

Select hosting before writing a platform-specific deployment adapter. Confirm region, budget, expected API/socket/media workloads, managed PostgreSQL and Redis support, TLS/private networking, secret storage, log/metric retention, backup/PITR, image registry access and migration-job execution. Record the choice in an ADR. ECS, Kubernetes and managed container platforms require their own reviewed manifests and identity policies; the optional Docker-host Compose example is not a substitute for them.

`infra/deploy/compose.staging.yaml` and `deploy.sh` are an optional single Docker-host reference. They require pre-provisioned secure PostgreSQL/Redis endpoints, protected separate runtime/migration environment files, a TLS reverse proxy and an authorized host. Keep files outside the checkout, restrict them to the deployment account, and use the secret store of the selected platform for hosted services. Runtime credentials must never have schema-owner privileges.

Set `EXPECTED_IMAGE_PREFIX`, `ZIPP_RUNTIME_ENV_FILE` and `ZIPP_MIGRATION_ENV_FILE`; pass runtime and migration references from the same reviewed successful release to `sh infra/deploy/deploy.sh deploy <runtime@sha256:...> <migration@sha256:...>`. The script validates references/configuration, pulls images, runs one migration job, then waits for API/worker health. Do not run parallel migration deployments. Review expand/contract compatibility and backups first.

If migration fails, stop promotion and investigate; do not reset the database or automatically retry a destructive change. If application readiness fails after migration, preserve logs and schema state, investigate dependencies and choose a schema-compatible previous runtime digest. Rollback requires explicit `ROLLBACK_SCHEMA_COMPATIBLE=true` and `rollback` mode. It never runs down migrations. Compose rollout is not atomic or a zero-downtime guarantee; production rollout strategy belongs to the selected host adapter. Demonstrate rollout, smoke checks and rollback in staging before marking CD complete.

## Local telemetry and baseline load

`npm run monitoring:up` starts the optional local collector, Prometheus and Grafana alongside rebuilt API/worker containers. Prometheus is at loopback `http://localhost:9090`; Grafana at `http://localhost:3300`. These development endpoints have no production access-control policy. Do not expose them publicly. Management metrics stay on container-private API port 3002 and worker port 3001; `/metrics` is absent from the public API.

Telemetry includes bounded HTTP/dependency/pool/queue/Redis-client metrics and sampled OTLP spans. The collector's basic debug exporter demonstrates receipt; it is not durable trace storage or a trace-search UI. Prometheus retains 24 hours locally. Alerts are initial rules, without paging integration. Select protected storage, retention and operational owners before production.

After `npm run services:test`, `npm run load:baseline` exercises only readiness on the isolated test network at 20 arrivals/second for 30 seconds by default. `npm run load:burst` runs a 20 → 100 → 20 arrivals/second ramp. These commands save reports under `artifacts/` and do not target the development or a remote API. The underlying k6 script requires explicit opt-in for remote load. Thresholds cover error rate, p95/p99 latency and dropped iterations. These foundation checks do not prove 1,000-user product, socket or calling capacity; use the M9 workload in `CAPACITY.md` later.

Current default connection budgets: each API/worker PostgreSQL pool has at most five connections, with a configuration ceiling of 20. Each API has two Redis health clients plus one queue-metrics client; each worker adds two BullMQ connections to those three. Allow additional isolated test/administrative clients and rolling-deployment overlap. For example, four APIs and two workers at the default pool size consume at most 30 application database connections and approximately 22 Redis connections, before operational/migration reserves. This is a planning calculation, not a selected host size; confirm actual limits and maximum replicas before activation. Production outbox/realtime clients will require a revised budget in their milestones.
