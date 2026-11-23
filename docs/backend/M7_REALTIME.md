# M7 realtime, communications and operations

2026-11-23 continuation: [operations](M7_OPERATIONS.md) and [mobile messages/inbox](M7_MOBILE_COMMUNICATIONS.md) source are present; source schema 61 tables/REST 138 operations/four unapplied M7 migrations. Self-hosted calling direction is recorded; real media/native/push acceptance remains open. [Completion checklist](M7_COMPLETION_CHECKLIST.md) keeps M8 on hold.

Updated 2026-11-21. **M7 is in progress. M7.1 private participant streams, M7.2 backend chat/support, M7.3 local device/notification foundation and M7.4 local call control/signaling have source and written tests; runtime/security/race/load/native verification is pending.** See [chat/support](M7_CHAT_SUPPORT.md), [notifications](M7_NOTIFICATIONS.md) and [local calling](M7_CALLING.md) for three unapplied additive migrations (58 application tables now defined). Mobile communications/notification integration, real push, actual calling audio/native behavior and broader staff operations remain pending. Do not call M7 complete because this transport compiles.

Read [ADR 0011](adr/0011-m7-participant-live-stream.md), [evidence](M7_VERIFICATION.md), [tracking/calls](LIVE_TRACKING_AND_CALLS.md), [M6 mobile setup](M6_MOBILE_INTEGRATION.md) and [capacity](CAPACITY.md). No provider account, paid infrastructure, deployment or test execution is implied.

## M7.1 implemented boundary

`backend/src/modules/realtime/` owns configuration, shared connection admission, stream lifecycle and the thin Socket.IO transport. Public ride/delivery facades provide a minimal authorized projection under their existing transaction and lock order; realtime imports no foreign repository. The API imports this module, and the worker does not. No new port, container, PostgreSQL table or migration: the development schema remains 45 application tables with readiness marker `m6`.

The installed server is Socket.IO 4.8.4. Mobile uses the same client version; backend dev dependencies include it for transport-test source. Nest remains 12.3.3 and Node 24.18.0. Existing HTTP adapter/lifecycle injection attaches the Socket.IO listener without installing unused Nest gateway packages. Backend tooling used installed npm 11.16.0 because the machine's default npm 12.2.2 violates the declared backend engine guard. That guard was preserved; no force/legacy-peer option was used. Versioned manifest/source compatibility evidence is in ADR 0011.

## Protocol

Socket.IO path `/api/v1/live/socket.io`, namespace `/`, **WebSocket only**. Long polling/upgrades, served client scripts, compression and automatic connection-state replay are disabled. Each connection follows one immutable RIDE or DELIVERY ID. It cannot subscribe to arbitrary rooms, use public delivery capability credentials or execute any business/location/financial command. Unsupported client events disconnect it. No audio flows through this stream.

The initial Socket.IO auth packet is strict:

```json
{
  "schemaVersion": 1,
  "accessToken": "<current private access JWT>",
  "jobType": "DELIVERY",
  "jobId": "<UUID v4>",
  "afterVersion": 0
}
```

Never put that token in a query, URL, WebView, log, notification or durable event. Query fields other than the bounded Engine.IO protocol fields are rejected before upgrade. Browser origins match an exact configured allowlist; native connections without Origin need a separate explicit flag. IP identity uses the actual socket peer, not arbitrary forwarding headers. Proxy trust/TLS/pre-upgrade DDoS controls remain a reviewed hosting task.

Server event `job.snapshot` contains schema/type, jobType/jobId/version, status, delivery custody or null, terminal flag, latest allowed position or null, `resyncRequired`, and `observedAt`. A position contains only coordinates, server receive timestamp and stale flag. No contacts, money, package photo, PIN, location epoch, reservation or credential appears. Terminal projections contain no position and close the stream. A new connection always sends a resync snapshot. A version gap or cursor ahead of the server requires fetching the current REST snapshot and versioned history; it never rewrites the server version.

Server `live.error` contains only schema version, a safe enum code and bounded retry seconds. Invalid/expired/revoked sessions, lost participant access or dependencies close the stream. Recheck token and feature-owned current session/account/ownership before every emission. Account/session revocation has a bounded next-cycle plus in-flight-transaction window; immediate worldwide invalidation is not claimed.

Generated contracts are `contracts/realtime-handshake.schema.json`, `realtime-snapshot.schema.json` and `realtime-error.schema.json`; `openapi.json` links them through `x-realtime`. This adds no fictitious REST endpoint or verified delivery guarantee.

## Admission and resources

Initial budgets: 50 admitted streams/API process, at most four simultaneous projection reads, two connections/account, 20/IP and 500 globally across replicas. Queue Redis with `noeviction` stores atomic short connection leases; cache Redis enforces handshake/actor rate windows. Renewable leases expire after 20 seconds, use Redis server time and cannot be revived after expiry. A lost lease/dependency closes the socket; a crashed process releases capacity by TTL. These leases affect transport capacity only and never release a ride, delivery, financial hold or custody.

Pending unauthenticated transports share a ceiling of 64 with existing Engine.IO clients. Reserve capacity before awaiting shared ingress admission, release reservations on upgrade/close or after five seconds, and enforce a five-second namespace timeout. Handshake ingress is 30/min/IP; authenticated opens are 10/min/account. Payload cap is 8 KiB; raw custom/binary mutation events are unsupported. Slow/unwritable consumers disconnect rather than accumulating a replay queue. Known Redis cleanup failure leaves a short-lived admission orphan rather than pretending a business operation was undone.

This first slice reads a fresh minimal projection approximately every three seconds plus bounded jitter. Each replica serves its own connected peers from PostgreSQL, so a mutation performed on another replica is visible without an in-memory room/busy flag or pub/sub dependency. Existing persisted booking/events plus REST recovery survive missed socket packets. There is no room broadcast or event relay in this slice and therefore no unnecessary Redis room adapter installed. Before adding room fanout, select the multi-instance adapter/outbox and current recipient authorization explicitly.

**The three-second pull projection does not establish the target propagation p95 <=2 seconds or 1,000-user capacity.** Read fanout/query budgets and shared limits must be measured before increasing caps. Baseline targets remain unchanged. This is the simple, bounded starting point for M7; multi-instance runtime and load evidence are pending.

## Local opt-in

| Setting | Default | Behavior |
| --- | --- | --- |
| `REALTIME_ENABLED` | `false` | When false, no listener is attached. API only. |
| `REALTIME_ALLOWED_ORIGINS` | empty | Up to ten exact browser origins, comma-separated. No wildcard, credentials/path/query. |
| `REALTIME_ALLOW_NATIVE` | `false` | Explicitly allows native no-Origin upgrades. |
| `EXPO_PUBLIC_REALTIME_ENABLED` | `false` | Enables the foreground mobile adapter in the M6 API flow. Contains no secret. |

Enabled local realtime requires `AUTH_ENABLED=true` and an explicit browser/native policy; production enablement is rejected pending this transport's acceptance. The corresponding ride/delivery feature must also be enabled to read its stream. No user's ignored env values or flags were changed. Compose passes realtime settings to the API only, with no worker API identity keys and no extra service. Do not run test stacks, enable optional monitoring or broaden localhost ports merely to enable this feature.

## Mobile recovery

The existing opt-in delivery API flow now uses `features/realtime/`. The client obtains a current JWT through the existing single-flight refresh boundary and sends it only in auth. It closes on navigation/background/account change, validates remote frames, checks matching job and nondecreasing version, updates the current marker and coalesces REST refreshes when state/version changes. The existing periodic REST path continues, at roughly 15 seconds while live traffic is healthy and the prior fallback cadence when it is not. The stream cannot itself declare a fare, settlement or PIN success.

On disconnection it clears the live position and attempts a fresh-token reconnect with exponential backoff/jitter, bounded to eight unsuccessful attempts. A five-second watchdog closes a stream when no valid frame has arrived for more than 12 seconds, so an open but stalled socket also triggers recovery. The client clears its handshake auth object once connected and on cleanup. Authorization/subscription errors do not retry forever. Every reconnect requests current REST state instead of replaying queued mutations. Disabled/unavailable live transport leaves REST recovery available. The backend and reusable client support RIDE streams, but the existing ride demo UI has not been converted to server booking by this slice.

No native background capability, microphone permission, push service or calling SDK is introduced. Foreground Socket.IO support is JavaScript-only; proxy/mobile/device reconnection and background transitions still need actual platform evidence.

## Remaining M7 slices

1. [Persistent chat/support backend](M7_CHAT_SUPPORT.md) is present with independent authorization, bounded messages, idempotency/history/read cursors and unapplied migration source. Finish mobile integration, retention/archive decision and authorized runtime acceptance.
2. [Device ownership, notification outbox/retries and local metadata capture](M7_NOTIFICATIONS.md) are implemented in source behind default-off flags. Runtime/queue/native/mobile acceptance is pending; actual provider sandbox integration remains M8.
3. Calling provider/self-hosted media ADR and native compatibility work, then durable call/device answer lifecycle, bounded authenticated signaling, short-lived relay credentials and OS incoming-call handling. Calling stays disabled until its own native/media evidence exists.
4. Scoped admin/support/finance controls, reviewable flags, reconciliation/reporting, reasoned audited actions and recovery tooling; support must never gain finance permissions through a broad role shortcut.
5. Measured room/outbox fanout, multi-replica recovery, native/background and load acceptance. No phase/capacity claim until those gates pass on command.
