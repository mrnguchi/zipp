# M7.3 devices and durable notifications

2026-11-23 continuation: opt-in [mobile generic activity inbox](M7_MOBILE_COMMUNICATIONS.md) source is present. Real tokens/provider delivery, OS permissions and native incoming-call wake remain unimplemented. LOCAL capture/device proof still never means phone delivery. [M7 completion](M7_COMPLETION_CHECKLIST.md) remains open.

Updated 2026-11-20. Backend source, migration file, generated contracts and test source are present. **Tests, migration application, queue/runtime/security/race/native acceptance and mobile integration remain pending. M7 is not complete.** Read [ADR 0013](adr/0013-m7-notification-devices-and-durable-delivery.md), [M7 evidence](M7_VERIFICATION.md), [chat/support](M7_CHAT_SUPPORT.md), [tracking/calling design](LIVE_TRACKING_AND_CALLS.md) and [dependency policy](DEPENDENCY_POLICY.md).

## Implemented boundary

Feature-owned `backend/src/modules/notifications/` contains private device/inbox REST services, a transactional source facade, Prisma persistence, encryption, delivery policy and an explicit local capture adapter. `platform/queues/notification.worker.ts` runs only in the existing worker with its own opt-in dispatch flag. Existing API/worker/PostgreSQL/Redis containers remain; one private capture volume is added. No new dependency, image version, external provider, paid service, mobile SDK or native permission was installed/enabled.

Source wiring covers current job-chat message participants and support-ticket owner replies/status changes. Existing owning ride/delivery context now returns bounded current participant IDs internally under the same identity/job locks; IDs are not added to public socket responses. Notification intent, source message/event and command receipt commit atomically. Duplicate source event/recipient is unique. The author is excluded; ticket creation by its owner does not notify that owner. There is no broadcast to every staff account and no public arbitrary-send endpoint. Ride/delivery lifecycle, wallet/payment notices and incoming-call notifications are not wired in this slice.

With source notifications disabled, enqueue is a no-op: enabling later does not backfill old communications events. Already accepted intents remain durable if dispatch is paused. No process-local room/busy flag or Redis-only lock determines ownership, delivery state or duplicate suppression. Financial outbox/workers and job/custody transitions are unchanged.

## Device contract

All endpoints use private bearer authentication at `/api/v1`, shared quotas and current account/session checks inside the transaction.

| Method and path | Input/result |
| --- | --- |
| `PUT /notifications/devices/:id` | Client UUID v4 installation ID; `{proof,expectedGeneration,platform,provider:"LOCAL",pushToken}`. Returns metadata only. |
| `POST /notifications/devices/:id/revoke` | `{proof,expectedGeneration}`; terminal revocation, ciphertext removal, generation invalidation; repeat revoke is harmless. |
| `GET /notifications/devices` | Own current, unrevoked, unexpired registrations; max five metadata items. |
| `GET /notifications/inbox` | Own generic activity notices; UUID keyset `cursor`, `limit` default 20/max 50. |
| `PUT /notifications/inbox/:id/read` | Empty JSON `{}`; first read timestamp retained on repeat. Possession of ID does not confer ownership. |

Proof is **client-generated 32 cryptographic random bytes**, canonical base64url (43 characters); retain it securely with the installation ID. The server stores a purpose-bound HMAC and never generates/returns raw proof. `platform` is ANDROID/IOS. Initial expected generation is 0; registration changes use the latest returned generation. Same owner/proof/endpoint/session/platform retries renew expiry without generation churn. Token rotation, session rebind or renewing an expired registration increments generation; stale changes return `409 DEVICE_VERSION_CONFLICT`. A delayed old registration cannot revert the current endpoint. Device owner/provider/proof are immutable; there is no transfer or proof retrieval endpoint.

Only dummy `LOCAL` tokens matching `local_` plus 16–160 URL-safe characters are accepted. Real Expo/APNs/FCM tokens are rejected. This is an adapter/ownership development boundary, **not verified ownership of an actual hardware/provider endpoint**. Real registration needs provider/project/app scoping and possession-verification decisions in M8. A globally unique token HMAC prevents two installation records claiming the same local endpoint. For account switch/reinstall, revoke when possible, discard the old proof, and create a new UUID/proof/dummy endpoint; old session revocation independently suppresses work. Never silently transfer a token to another account.

Registration expires after 30 days; maximum five live installations/account, generation maximum 1,000,000 and write quota 10/min/account. At the generation ceiling, new registration changes require a fresh identity; revocation is still permitted. A revoked ID cannot be reactivated. Old queued generations are suppressed; a confirmed invalid result revokes only its claimed generation, leaving a newer registration intact. Session expiry/revocation, account suspension or device expiry does not release a ride, parcel, money hold or call slot.

Metadata includes only ID, platform, LOCAL provider, generation, expiry and revocation timestamp. No token, proof, HMAC, ciphertext, owner or session ID appears in responses. All notification REST responses use `Cache-Control: no-store`; body/headers/URLs remain excluded from logs by normal bootstrap.

## Inbox and privacy

Inbox items contain `{id,type:"ACTIVITY",text:"You have new activity. Open Zipp to view it.",readAt,createdAt}` only. No thread/job ID/type, message/subject, participant/contact, money, PIN, raw token, secret, deep link or arbitrary client payload. Clients fetch current authorized active jobs/tickets/history after opening the app; the notification is never a resource-access grant. This generic payload also limits exposure if membership changes while an external provider action is in flight.

Inbox pagination uses immutable UUID order, not newest-first chronology; read acknowledgement records the client's action rather than proof of human reading. Profile `notificationsEnabled=false` suppresses push work while preserving the private inbox for an active recipient. A missing profile fails closed for push. Intents older than 24h can still become inbox history for active recipients, but produce no expired push work. Inactive owners are suppressed. Devices added after materialization receive no historical replay; reconnect/inbox retrieval is the recovery path.

## Worker and recovery

1. Source transaction creates one `notification_outbox` record per bounded current recipient except author, alongside the communication event/message/receipt. No provider I/O occurs there. Uniqueness retains logical notification identity across retries.
2. With dispatch explicitly enabled, the existing worker scans up to 20 incomplete intents and 20 due deliveries every two seconds, relaying strict `{schemaVersion:1,kind:"MATERIALIZE"|"DISPATCH",id}` to BullMQ `notification-delivery`. Payload contains no user/token/body. PostgreSQL rescans recover Redis loss, removed jobs and abandoned leases; queue acceptance is not delivery.
3. Materialization locks recipient then outbox, rechecks account and preference, and atomically creates one inbox record and up to five delivery rows for current registrations, marking outbox complete. Repeated/competing materialization creates no duplicate inbox/delivery. An opted-out/no-device/expired intent can still create inbox without push records.
4. Dispatch locks owner -> device -> delivery. Check active bound session, account, preference, generation, revocation/expiry and intent expiry. Claim a 30-second token-fenced PostgreSQL lease, counting an attempt. Recheck immediately before I/O; use database wall-clock after acquiring locks so transaction-start time cannot revive an expired lease.
5. Adapter I/O is outside the transaction. An eight-second abort/deadline bounds the worker wait; future adapters must honor cancellation and reconcile ambiguous outcomes. The current capture adapter performs no network call. Completion requires the same still-live lease; stale/expired workers cannot overwrite newer work. A revoke after preflight can race an in-flight action; instantaneous cancellation is not claimed.
6. `CAPTURED` means a stable local capture record exists, **not delivery to a push provider or phone**. Capture files contain schema version, delivery/notification/device IDs and generation, without token/proof/account/body. UUID paths and exclusive creation prevent path injection/overwrite; an identical existing record recovers a lost acknowledgement, while a mismatching record fails. Keep captures private. A process/filesystem crash that leaves an incomplete file goes to bounded retry/review rather than fake success.
7. Safe dependency failures retry with persisted exponential backoff/jitter, bounded below five minutes and at most eight attempts. An abandoned final attempt becomes `REVIEW_REQUIRED` after lease expiry without a ninth send. Invalid session/device/preference/generation or expired intent becomes `SUPPRESSED`. Confirmed invalid endpoint revokes only its matching generation. No public force-delivered/retry endpoint, automatic token clearing on an ambiguous error, or financial/custody effect.

Worker concurrency is two per instance; BullMQ shares a queue limiter of 20 commands/second, including materialization. Producers have a two-second Redis command budget; failed Redis work remains recoverable in PostgreSQL. These are initial bounds, not a capacity/latency claim. Measure queue age, database pool/locks, outbox age, retries and capture disk use before raising limits. The existing worker service has separate execution from the API; no API replica starts a notification consumer.

Compose gives the worker 60 seconds to drain its active bounded adapter/transaction work, while API grace is unchanged. A hard kill still leaves a durable lease/intent for recovery; this is source configuration, not observed shutdown evidence.

## Configuration and migration

| Setting | Default | Purpose |
| --- | --- | --- |
| `NOTIFICATIONS_ENABLED` | false | API source/device/inbox feature and worker persistence gate. |
| `NOTIFICATION_DATA_KEY` | empty | Dedicated random 32-byte hex key shared by API/worker; required only when enabled. Must differ from configured identity keys. |
| `NOTIFICATION_ADAPTER` | capture | Only local capture accepted; real providers/production rejected. |
| `NOTIFICATION_DISPATCH_ENABLED` | false | Worker-only execution; requires feature enabled and `SERVICE_ROLE=worker`. |
| `NOTIFICATION_CAPTURE_ROOT` | empty outside Compose | Absolute private directory required for worker dispatch; Compose uses `/var/lib/zipp/notification-captures`. |

Use a dedicated stable secret stored in ignored local configuration, never Git/mobile variables or command output/logs. HKDF separates AES-256-GCM and HMAC keys. Ciphertext AAD binds canonical device ID/generation. The worker needs this notification key, **not API signing, identity digest or enrollment encryption keys**; current identity/account eligibility is read through public facades without signing. Local worker entry sets its service role before construction. Keep API dispatch false when using the shared local env; explicitly set dispatch for a chosen worker process/Compose only.

Do not replace the data key casually: old proof/token HMACs and ciphertext depend on it. Multi-key rotation/re-encryption is not implemented; a future keyring/registration migration needs a reviewed recovery plan. No automatic setup generates/replaces this key and no ignored env was changed in this pass.

Migration source `backend/prisma/migrations/20261120010000_notification_devices_delivery/migration.sql` adds:

| Table | Responsibility |
| --- | --- |
| `notification_devices` | Immutable owner/proof, session binding, encrypted dummy endpoint, generation and expiry/revocation. |
| `notification_outbox` | Unique communication-source event/recipient intent with dispatch expiry. |
| `notification_inbox` | Unique private recipient activity and immutable first read time. |
| `notification_deliveries` | Per-notification/device/generation work, attempts, status, deadlines and fenced leases. |

SQL adds owner-consistent foreign keys (including a new unique session ID/user pair), bounded state/secret shapes, device count/ownership/generation guards, read monotonicity, indexes and restricted column grants. Schema now defines **54 application tables**. Both M7 migrations remain **unapplied here**; the last identified local development evidence is 45 tables/base `m6`. Enabled notifications require separate `notifications=m7_3` and `communications=m7_2` markers. Disabled notifications preserve base readiness `m6`. Identify/review the target before a future migration/app startup; Compose application startup already includes a migration job. No reset, seed or database connection was performed in this pass.

There is no automatic purge. Source events, outbox identity and inbox references must remain consistent through any future approved retention/archive policy. Quotas/message/device bounds do not prove unlimited storage; captures and historical notifications need retention/disk budgets before runtime acceptance.

## Pending acceptance

Tests are written but **unrun**: bounded schemas/config, encryption/AAD/tampering, device proof/session/rotation/revocation, old-worker fencing, deadlines/backoff/review, local capture idempotency/privacy, real PostgreSQL source rollback/replay/materialization/admission races, profile/session gates, owner inbox/read behavior, worker eligibility without identity keys and HTTP validation/private errors. Database/provider/admission doubles are identified in each suite; they do not prove actual Redis/BullMQ/native behavior.

Still required on command: isolated clean/upgrade migration and privilege/trigger/FK execution; real Redis/queue loss/restart/stalled work and multi-replica source/worker races; shutdown/timeout/disk-full/crash cases; load/pool/memory/latency evidence; approved retention and key rotation; mobile permission/token/account-switch/navigation integration with safe rendering and native device tests. Real Expo/APNs/FCM receipt/invalid-token/provider work is M8. Calling needs its own native/VoIP/media ADR and acceptance; this generic capture path is not incoming-call delivery. Broader staff operations remain later M7 work.
