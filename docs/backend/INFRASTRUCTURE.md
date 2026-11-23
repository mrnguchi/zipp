# Containers, environments and CI/CD

Status: M0 local containers and M1 delivery/optional telemetry source are implemented. See [M0 verification](M0_VERIFICATION.md), [M1 evidence](M1_VERIFICATION.md) and [ADR 0003](adr/0003-local-first-manual-verification.md). M1 verification awaits the user's command. PR CI runs build/static checks only; tests/scans/load checks require opt-in. Release and staging preparation are dormant by default. Hosting is deferred until the whole system is complete and verified, followed by explicit deployment authorization. Production infrastructure, media and storage remain future work.

## Container/service inventory

| Service | Responsibility | Persistence and exposure |
| --- | --- | --- |
| ingress | HTTPS, balancing, body/connection limits and timeouts | Public 443 only; local development port override |
| api | Nest REST + Socket.IO replicas | Stateless; private service port |
| worker | BullMQ consumers, outbox relay, reconciliation | Stateless process, durable work in DB/queue; no public port |
| migrate | One-shot Prisma migration deployment | Deployment job, exits on success; never starts with every API replica |
| postgres | Authoritative relational data | Persistent volume, backups/PITR; private network |
| redis-queue | BullMQ scheduling/queue data | Persistence configured, `noeviction`, bounded retention; private network |
| redis-cache | Rate-limit counters, cache, presence | Separate eviction/budget policies; private network |
| object-storage | Private local S3-compatible test storage | Dev/test profile; production private object storage |
| telemetry | OpenTelemetry collector + metrics/log/dashboard tooling | Optional local profile; production equivalents with private access |
| turn/media relay (conditional) | WebRTC audio connectivity/relay after calling ADR | Separate public media listener/relay ports, authenticated short-lived access and bandwidth budget; managed equivalent requires explicit provider decision |
| test / k6 | Disposable verification runners | Test profile; isolated databases, queues and object prefixes |

Dockerize every self-hosted service with one clear responsibility per container. Production managed PostgreSQL/Redis/object storage are an acceptable operational equivalent only if an ADR documents the choice and durability, security and load gates still pass. External payment/SMS providers are adapters, not containers we operate.

See [live tracking and calls](LIVE_TRACKING_AND_CALLS.md) for media port/firewall/TLS, TURN abuse prevention, native push, privacy and independent media scaling. HTTP ingress alone does not provide WebRTC relay connectivity; selecting a provider does not remove the need for native/real-network tests.

Local Compose must start API, worker and required dependencies, wait for meaningful health conditions, and provide named dev/test volumes and networks. Bind locally exposed data ports to loopback. Use profiles for optional observability, storage emulation and tests. Production must not assume a single Compose host provides high availability.

## Image and runtime rules

- Multi-stage Docker build: locked install, Prisma generation, compile/test stages as appropriate, minimal production runtime. Runtime contains required generated Prisma artifacts/native libraries and compiled code only.
- Run as non-root with dropped capabilities, `no-new-privileges`, resource limits and read-only root filesystem where compatible; use an explicit writable temporary mount.
- Pin tested base/service versions and release image digests. No floating `latest`. Rebuild and scan regularly; controlled dependency updates still require CI.
- `.dockerignore` excludes secrets, `.git`, local dependencies, test outputs and irrelevant mobile assets from backend build context. Never pass secrets as persistent build args/layers.
- API/worker image is built once per release and promoted by digest. Handle SIGTERM, stop accepting new work, drain HTTP/WS, close workers/Prisma/Redis, and allow termination grace beyond normal job/request deadlines.
- Liveness detects process failure; readiness detects ability to safely accept its work. Queue outage can leave safe reads available while dependent writes return 503. Do not restart healthy processes merely because an external provider is slow.

## Environment and database policy

Use separate local, test, staging and production credentials, databases, Redis instances/namespaces, object prefixes, provider accounts and secrets. Typed config validates ranges and production requirements at startup. `.env.example` contains dummy values and clearly marks required/optional settings.

Keep environment-specific configuration outside images. Use a secrets manager/orchestrator secrets; expose only safe settings to the mobile build. Use distinct application and migration DB roles; app cannot perform arbitrary schema changes. Keep Postgres/Redis private, require authentication, and use encrypted connections across untrusted networks.

Migrations are generated/reviewed and committed, tested on a clean DB and previous schema snapshot. Deploy uses `prisma migrate deploy` or the pinned-version equivalent, under a single controlled migration job/lock. No `db push`, `migrate dev`, resets or automatic development seeds in production. Use expand/contract changes so old/new API and workers can coexist during rollout. Large backfills are resumable bounded jobs with progress metrics.

## Pipeline contract

Default: GitHub Actions with an OCI registry such as GHCR. Select actual host and repository permissions before deployment wiring. Keep CI portable through project scripts/Compose so it can move to another provider.

| Trigger/stage | Required work | Gate/output |
| --- | --- | --- |
| Pull request | Frozen install; Prisma validate/generate; format/lint/types; module-boundary checks; unit tests | Fast deterministic checks; safe PR token with no production secrets |
| Pull request service tests | Isolated Postgres/Redis; migrations; integration/race tests; HTTP/WS E2E; contract and authorization tests | No skipped critical checks; repeatable cleanup of test resources |
| Pull request security/image | Secret/dependency/static scan; Docker build/container smoke; image vulnerability scan | Required checks with documented, expiring exceptions only |
| Main/release build | Re-run required gates; build image once; produce SBOM/provenance; scan; publish commit-tagged digest | Immutable release artifact and traceable manifest |
| Staging delivery | Restricted credentials/OIDC; migration job; rolling deploy by digest; smoke/E2E; scheduled load/recovery suites | Tested release candidate and environment report |
| Production promotion | Protected release trigger; same digest; backup/migration preflight; staged rollout | Automated health/error/latency gates; halt on failure |
| Post-deploy | Verify critical read/auth/payment invariants safely; watch dashboards; record version/schema | Release evidence, alerts and rollback decision |

Use minimum job permissions, full commit SHA pins for external actions, protected branches/environments, concurrency controls per environment, and OIDC short-lived credentials when the host supports them. Never run untrusted fork code with deployment secrets, interpolate user input into shell commands, or run write-capable `pull_request_target` checkout patterns. Restrict registry write access to trusted release jobs.

Define artifact retention, cache keys tied to lockfile/runtime, maximum job durations and test-service health timeouts. PRs do not deploy production. Use checks relevant to backend/infra changes without silently skipping required shared/security changes.

## Scaling and availability

Production target is at least two API replicas across failure domains when hosting supports it, independently scalable workers and a load balancer. One DB container on one machine is a single point of failure even with replicas of the API. Choose PostgreSQL failover/replication, Redis availability and backup storage explicitly before claiming availability.

Budget total API/worker/outbox/migration DB connections and Redis clients at the maximum replica count. Scale workers from queue age/depth and API from latency, concurrency, CPU and memory together; DB capacity is an upper bound. Redis pub/sub is realtime transport, not durable event storage.

## Operations and recovery

- Instrument structured redacted logs, request IDs, traces, request/error/latency metrics, event-loop lag, pool wait/usage, query latency/locks, Redis memory/evictions, queue age/retries, provider latency, and outbox lag.
- Alert on financial mismatches, sustained 5xx/503, authentication anomalies, stale location/dispatch, stuck withdrawals, queue growth, low disk and failed backups. Avoid user/booking IDs as unbounded metric labels.
- Backups are encrypted and independently stored; use PostgreSQL PITR where required. Proposed financial DB objectives: RPO <= 5 min, RTO <= 60 min; select infrastructure capable of them and prove restoration before pilot.
- Test lost queue/cache data, provider timeout, worker crash, API replica failure and DB recovery. Outbox + idempotency reconstruct financial work without duplicate effects.
- Roll back application/worker image to a compatible digest. Database changes usually need forward repair; never assume destructive down-migration is a safe rollback.
- Create runbooks for failed deployment, DB restore, payment reconciliation, stuck job/payout, credential rotation, provider outage and controlled service suspension. Record owners and evidence.

## M7.1 local live transport

[ADR 0011](adr/0011-m7-participant-live-stream.md) attaches the opt-in Socket.IO server to the existing API port at `/api/v1/live/socket.io`; worker and service inventory are unchanged. Compose passes realtime enable/origin/native settings only to the API; defaults remain disabled. Queue Redis provides noeviction admission leases; cache Redis provides rate windows. No Redis pub/sub adapter/room broadcast is used by this initial pull-projection slice. Do not enable polling, trust arbitrary forwarding headers or add a broadcast without a reviewed cross-instance adapter and current recipient authorization. Edge upgrade/TLS/abuse budgets and all native/load acceptance remain unverified; [M7 evidence](M7_VERIFICATION.md).

M7.2 adds API-only `COMMUNICATIONS_ENABLED=false` with no new dependency service or worker consumer. Its additive five-table migration is source only; enabled API bootstrap requires separate metadata `communications=m7_2`, while base readiness remains `m6` for disabled-feature compatibility. Identify/review the target before future migration-job/application startup. [Chat/support runbook](M7_CHAT_SUPPORT.md) covers durability, bounded queries, private data and unrun acceptance; it does not enable push delivery or publish chat events.

M7.3 adds default-disabled notifications to the existing API/worker and one private capture volume, with no new image version/service/container. API receives feature flag plus dedicated notification key; only worker receives dispatch flag and capture root. No API identity signing/enrollment keys are added to worker. Runtime image initializes the private capture directory for its existing non-root user. Enabled feature checks `notifications=m7_3` and `communications=m7_2`; both M7 migrations remain unapplied in the implementation pass. Source now has 54 tables versus last identified local applied evidence 45/base `m6`. Queue `notification-delivery` has versioned ID-only commands, concurrency two and shared limit 20/sec; PostgreSQL leases/uniqueness recover duplicates/Redis loss. Capture means local metadata only, not external delivery; see [notification runbook](M7_NOTIFICATIONS.md). All runtime/queue/native/load/container verification awaits command.

Worker Compose drain grace is 60 seconds for bounded notification adapter/transaction work; API grace remains 15 seconds. This setting has not been exercised by a shutdown test. Crash/kill safety still depends on durable intents, lease expiry and retry-safe effects, not an assumption that every process exits gracefully.

M7.4 adds only local call metadata/signaling API and an opt-in bounded reaper in the existing worker, with no new package/service/container/media port. API receives `CALLING_ENABLED`, local adapter and dedicated `CALL_SIGNAL_KEY`; worker receives calling/reaper flags only and no signal/API signing keys. Both entry points set their role explicitly before provider construction. Cache Redis holds short-lived encrypted diagnostic signals; PostgreSQL holds call metadata/slots/receipts/events. Separate marker `calling=m7_4` is required only on enablement; its third M7 migration remains unapplied (58 source tables, last identified local applied evidence 45/base `m6`). No TURN deployment or provider/native media path is configured. See [calling runbook](M7_CALLING.md) for pending verification and future media deployment/teardown gates.

## M7.5 local continuation (2026-11-23)

API-only OPERATIONS_ENABLED defaults false; worker has no operations or extra identity/media key. Three-table operations migration supplements the other three unapplied M7 migrations (61 source tables). No service/image/port was added. Self-hosted coturn direction has a non-executable review template in infra/calling only; no Compose relay/published ports or SDK was added. Local zipp_dev connection and Docker engine were unavailable during identification; no service start, migration/reset/seed or tests ran. See [completion prerequisites](M7_COMPLETION_CHECKLIST.md).
