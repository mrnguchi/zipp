# Capacity, rate limits and resilience contract

These are proposed acceptance targets for the new backend, not benchmark results. A user count alone cannot size a system: request rate, active sockets, writes, fanout, provider latency and query cost must be measured separately.

M7.3 initial notification bounds are recorded in [ADR 0013](adr/0013-m7-notification-devices-and-durable-delivery.md) and the [runbook](M7_NOTIFICATIONS.md): source fanout <=4, five live devices/account, 20 intent + 20 delivery candidates/two-second scan, two worker jobs/instance, shared queue limit 20 commands/sec, eight-second adapter budget and eight persisted attempts before review. Notification state is PostgreSQL-owned; queues/captures carry no private message/token data. These limits are unmeasured admission/bulkhead defaults, not provider, 1,000-user, native push or latency capacity evidence. Keep feature/dispatch disabled until deliberately selected, and run load/failure verification only on command.

M7.4 local call-control limits ([ADR 0014](adr/0014-m7-call-control-and-ephemeral-signaling.md), [runbook](M7_CALLING.md)): 100 control sessions under PostgreSQL admission, one active call/account, five create requests/minute, symmetric 30s pair cooldown, 30s ring and 30s local CONNECTING deadlines, 64 packets/direction/epoch, <=8 KiB SDP/1 KiB ICE and 32-packet reads. Reaper scans <=20 per two-second batch and stops between candidates on shutdown. Signaling remains finite encrypted cache data with fresh authorization around network I/O. These are unmeasured bounds, not evidence of 100 audio sessions or the media benchmark below; no real media or native wake path exists yet. Measure DB/Redis/lock/reaper and physical media separately on command.

Read [live tracking and calls](LIVE_TRACKING_AND_CALLS.md) for location freshness, bounded fanout, call quotas and separate media gates. Add a proposed 100 concurrent audio-session (200 endpoint) benchmark including forced-relay traffic, >=95% setup success and p95 <=5 s accept-to-bidirectional-audio under documented healthy test conditions. Report relay fraction, bandwidth, packet loss/jitter/RTT and actual device/network results. These are targets to validate; k6 API/signaling tests and the 1,000-user HTTP/socket profile cannot establish audio quality/capacity.

## Workload to prove before pilot

| Profile | Initial test definition |
| --- | --- |
| Realistic data | At least 10,000 test accounts and 1 million historical booking/ledger records with indexed, paginated queries; record fixtures and sizes |
| Concurrent sessions | 1,000 authenticated active users, 1,000 open sockets, with 200 active drivers sending GPS every 5 s (40 incoming location events/s) |
| Sustained HTTP | Open-model arrival rate of 200 requests/s for 30 min; 70% bounded reads, 20% quotes/search, 5% booking actions, 5% wallet/account/support writes |
| Realtime soak | Maintain sockets/driver traffic for 2 h; measure authorized fanout, disconnections, memory trend and resync |
| Burst | Increase HTTP from 200 to 1,000 requests/s within 10 s, hold 60 s, recover to baseline; approved overload responses are measured separately |
| Beyond baseline | Explore 2,000 active sessions and stepwise higher traffic; record the first failed budget and scaling action rather than claim unlimited capacity |
| Faults | Kill one API replica, restart a worker, delay providers, disconnect Redis, and exercise database failover/recovery in isolated staging |

All traffic mixes sum to 100%; GPS events and socket handshakes are additional traffic, not hidden inside HTTP RPS. Do not generate financial traffic against real money providers. Use seeded identities, realistic access rules and production-like configuration. Measure both mocked-provider capacity and actual sandbox latency separately.

## Initial acceptance budgets

- At sustained load, core HTTP p95 <= 500 ms, p99 <= 1 s, unexpected 5xx/network failure rate < 1%. Measure providers and long-running operations separately; asynchronous commands should acknowledge persisted work quickly.
- Authentication hashing endpoints have a separate initial p95 <= 1 s budget at their permitted rate; do not weaken password hashing to meet a generic latency number.
- Healthy admitted baseline traffic should not be throttled unexpectedly. During burst, 429/503 may shed excess load with Retry-After; report total rejected traffic and admitted latency separately so intentional shedding cannot hide a capacity shortfall.
- At least 99% of admitted persisted outbox events are published within 5 s under baseline load; oldest queued/outbox work returns to baseline within 2 min after the burst, with no lost accepted operation or duplicate financial posting.
- Target driver updates every 3-5 s and internal event propagation p95 <= 2 s under healthy network conditions. Dispatch initial offers target <= 5 s when eligible supply exists. Report separately from actual driver acceptance.
- Baseline CPU below 70% sustained, memory below 75% of limits without monotonic soak growth; connection/queue budgets retain headroom. Hardware, replica counts, database tier, indexes and network region must accompany results.
- A killed API replica must not corrupt accepted work. Remaining healthy replicas continue service while ingress removes the failed node; record reconnect/error/recovery times and tune the gate against the selected host.

Use k6 thresholds and custom metrics to fail tests on violated budgets. Ensure the generator is not saturated and report dropped iterations. Fixed VUs alone do not prove a requested arrival rate. Load reports include commit/image digest, versions, fixtures, hardware, parameters, latency percentiles, throughput, errors, admitted/rejected work, resources and bottlenecks.

## Spike protection and bounded work

- Edge limits cap request bytes, connections, timeouts and upload sizes; application limits cap actor/route use and concurrent expensive work. DDoS protection at the network provider remains separate from application throttling.
- Redis-backed atomic limit counters are shared across API replicas. Do not use the default process-local counter as the production limiter. Implement/test the storage adapter against the chosen Nest throttler version.
- Configure trusted proxy hops/CIDRs explicitly. Arbitrary forwarded IP headers cannot choose the rate-limit identity. Enforce per-account/device and IP limits to reduce NAT unfairness and account-targeted abuse.
- Short timeouts and bulkheads isolate routing/payment/SMS adapters. Use capped retries with jitter and a total retry budget; avoid retry amplification across client/API/worker/provider layers.
- API expensive work has bounded concurrency and queue wait. Hashing, uploads and routing requests cannot block the event loop or fill memory. Offload CPU-heavy tasks only when measurements justify a worker/process pool.
- Paginate data, index common queries, batch reads, cache safe stable data and prevent cache stampedes. Never cache a spend/permission decision as authoritative.
- Workers have bounded per-queue/global concurrency, provider quotas, maximum attempts, retained failure metadata and review/replay tooling. Queue-depth/oldest-age thresholds trigger alerts and admission control.
- Refresh/reconnect and client retries use exponential backoff with jitter. Deduplicate refresh and booking retries; reconnection storms have a separate handshake quota.

## Initial rate-limit policy

Defaults to validate and tune in staging; not provider quotas or immutable product policy. Windows use shared counters with documented algorithm and atomic updates.

| Operation | Initial limit/key | Additional control |
| --- | --- | --- |
| General authenticated REST | 120 requests/min/account, burst 30/10 s | Separate route weights; health probes exempt only on private management paths |
| General anonymous REST | 60/min/IP | Edge connection/body limits and public-route allowlist |
| Login | 5 failed attempts/15 min/account + 30 attempts/15 min/IP | Progressive delay, generic response, no permanent attacker-triggered lockout |
| OTP send/resend | 1/min/account + 5/hour/account + 20/hour/IP | Provider spending cap, anti-enumeration behavior and cooldown |
| OTP/PIN verification | 5 failed attempts/challenge | Persist attempt budget in PostgreSQL; expiry and atomic consume survive Redis loss |
| Quote/routing | 20/min/account, max 2 in flight/account | Provider timeout/bulkhead, short-lived quote cache |
| Booking creation | 5/min/account | Idempotency replay returns original result; bounded outstanding bookings |
| Payment initiation | 5/10 min/account | Idempotency, amount limits, recent 2FA and provider spending limits |
| Withdrawal creation | 3/hour/account | 2FA, reservation, policy/finance checks |
| Socket handshake | 20/min/IP, max 3 sockets/account | Tuned reconnect allowance, token validation, max total connections per instance |
| GPS updates | 1/s/active driver, burst 5/5 s | Normal cadence 3-5 s; validate coordinate/time/eligibility; bound fanout |
| Chat commands | 30/min/account | Message length/attachment limits and participant checks |
| Provider callbacks | Dedicated authenticated ingress policy | Separate budget from consumers; never casually throttle provider retries with the user quota |

Before accounting claims, every request/event must be cheap to reject. Replays are cheap but still bounded to prevent key-based bypass. Successful and failed identity operations have intentional separate counters. Return standard 429 with Retry-After where applicable.

## Connection budget and scale policy

Use one Prisma/driver pool per process. Define explicit connection limits/timeouts at the selected driver layer; defaults vary by Prisma version. Budget maximum, not current, replicas:

`api_replicas * api_pool + worker_replicas * worker_pool + relay_connections + migration_connections + operator_reserve <= database_connection_budget`.

Illustrative planning example: 4 API replicas x 10 + 2 workers x 5 + 5 relay/migration + 15 operator reserve = 70 connections. This is a sizing example, not a chosen PostgreSQL configuration. Reserve headroom for failover and deployments with overlapping replicas. Add a compatible connection pooler only after verifying Prisma transaction/session/prepared-statement behavior.

Scale API replicas using concurrency, latency, CPU, memory and pool wait. Scale workers using oldest-job age/depth and provider/DB budgets. Set minimum/maximum replicas and queue concurrency; autoscaling cannot solve a saturated DB or provider quota. Do not let every worker create unlimited Prisma/Redis clients. Redis queue is `noeviction` with capacity alerts; cache eviction is isolated.

## Dependency failure behavior

| Failure | Required behavior |
| --- | --- |
| PostgreSQL unavailable | Reject new mutations with 503; never acknowledge unpersisted money/job success; keep health/diagnostics safe |
| Queue Redis unavailable | Persist permitted work through DB outbox or reject dependent action explicitly; bounded backlog and reconciliation after recovery |
| Rate-limit Redis unavailable | Fail closed for authentication/code send and sensitive money initiation; cheap reads use bounded conservative local fallback plus ingress limits and alerts |
| Cache/presence unavailable | Fall back only where DB load budget permits; stale driver eligibility cannot produce unsafe dispatch |
| Payment/SMS/routing provider slow | Timeout/circuit isolation; persist pending status for ambiguous payments; retry/reconcile without double effects |
| Worker dies after external effect | Provider operation identity + DB dedup recover; never blindly repeat payout |
| Socket/pubsub disconnect | REST snapshot remains authoritative; clients reconnect/backoff and resync versioned state |

These policies must be tested with multi-replica scenarios; neither a Redis counter nor extra containers alone proves resilience.

## M7.5 initial work bounds (2026-11-23)

Staff actor quotas are 20 writes/minute and 60 reads/minute plus shared REST limits. Case/report/event pages cap at 50 and case history at 1,000 versions; no unbounded export or full-provider reconciliation request. Native foreground communication reads cap at 50 messages/page, 200 retained rows and one active five-second history poll, with separate bounded acknowledgement quota. Ticket/inbox pages use 20 items and retain at most 100 rows. All are source budgets requiring runtime/query/lock/native evidence, not measured capacity. TURN template quotas/bandwidth are proposals, not 100-session acceptance. No load test ran.
