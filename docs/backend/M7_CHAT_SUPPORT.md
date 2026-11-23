# M7.2 participant chat and support tickets

2026-11-23 continuation: opt-in [mobile Messages/support and delivery conversation integration](M7_MOBILE_COMMUNICATIONS.md) source is present. Native/runtime/retry/role acceptance remains pending; no tests were run. Staff operations extends reviewed metadata through [its own module](M7_OPERATIONS.md), not private job-chat access or financial/custody overrides.

Updated 2026-11-20. Backend source, migration file, contracts and test source are present. **Tests, migration application, runtime/security/race and mobile integration are pending. M7 is not complete.** Read [ADR 0012](adr/0012-m7-chat-and-support-tickets.md), [M7 evidence](M7_VERIFICATION.md), [architecture](ARCHITECTURE.md) and [M7.1 transport](M7_REALTIME.md).

M7.3 continuation: [notifications](M7_NOTIFICATIONS.md) now adds an opt-in transactional notification-intent facade call for new messages/current participants and staff ticket status changes. The generic inbox/capture path has its own four-table unapplied migration and disabled worker consumer. No message text/subject enters notification payloads and no chat socket broadcast or real push delivery is enabled. Counts and no-consumer statements below describe the original M7.2 slice; current total source schema is 54 tables, with last identified local applied evidence still 45/base `m6`.

## Scope and permissions

`backend/src/modules/communications/` owns persistent plain-text messages and support tickets. No packages, containers, ports, native permissions or worker consumers are added. Existing PostgreSQL, Prisma, identity, audit and Redis-backed quotas are reused. REST persists commands/history; the read-only M7.1 socket has no chat send/broadcast path. Mobile chat/ticket screens are not yet connected to these endpoints.

| Context | Read and reply policy |
| --- | --- |
| Job conversation | Current authenticated ride/delivery participants only, through the owning feature's public facade. Public tracking links and SUPPORT/ADMIN/FINANCE roles alone confer no access. |
| Terminal job | Existing history remains readable to currently authorized participants; new messages and new thread creation are blocked. An already accepted message can still be recovered using its original key. |
| Delivery contact joins | A verified newly bound participant may see existing history after joining. Unverified phone contacts cannot read by knowing a job ID. Reassigned former couriers lose access. |
| Support ticket owner | Opens, reads, replies, resolves and reopens their own tickets, subject to current account/session and limits. Optional job context is checked at creation; a ticket does not grant its staff access to job tracking or operations. |
| Support staff | Current SUPPORT or ADMIN plus recent MFA on every queue/read/reply/status request concerning another owner. FINANCE alone is insufficient. Status changes carry a controlled reason and an audit record. |

Tickets contain no private staff notes, media attachments or emergency-service delivery promise. Messages are plain text: consumers must render as text without HTML/Markdown execution or automatic URL fetching. Never put bodies/subjects in logs, analytics, notifications or reference-only events. The normal HTTP response policy is `Cache-Control: no-store`.

## REST contract

All paths have prefix `/api/v1`; private bearer access authentication is mandatory. Runtime schema validation rejects extra fields, malformed IDs, unsupported categories/status/reasons and oversized input. A successful write returns `200` once committed, with an immutable receipt where listed; it does not mean another person received or read the message.

| Method and path | Behavior |
| --- | --- |
| `POST /communications/job-conversations` | `{jobType,jobId}`; create or retrieve the single authorized job thread. Natural uniqueness makes retry safe without a request key. |
| `POST /communications/tickets` | `{subject,category,body,job?}` plus `Idempotency-Key`; create ticket and initial message atomically. Returns receipt. |
| `GET /communications/tickets` | Current owner's tickets; `cursor`, `limit` <=30, optional `status`. |
| `GET /communications/support/tickets` | Staff queue with current SUPPORT/ADMIN and recent MFA; same bounded parameters. |
| `GET /communications/threads/:id` | Authorized metadata, last sequence/version, writable flag and the caller's read cursor. |
| `GET /communications/threads/:id/messages` | Ascending message sequence after `after` (default 0), `limit` default 30/max 50; returns current thread metadata, items, `nextAfter` and own read cursor. |
| `POST /communications/threads/:id/messages` | `{body}` plus `Idempotency-Key`; append once, returning receipt. |
| `PUT /communications/threads/:id/read-cursor` | `{sequence}`; maximum of committed prior/requested cursor, bounded by latest committed message. Returns `{readSequence}`. |
| `POST /communications/tickets/:id/status` | `{status,expectedVersion,reason}` plus `Idempotency-Key`; resolve/reopen a ticket under fresh authorization and version check. Returns receipt. |

Receipt shape: `{threadId,messageId,sequence,version}`. Status receipts have null message/sequence. GET supplies current state; a historical command receipt deliberately retains its original version. Message rows expose only ID, sequence, author user ID, body and UTC creation timestamp. They exclude session, phone, location and raw internal job/financial records.

Ticket categories: `ACCOUNT`, `RIDE`, `DELIVERY`, `PAYMENT`, `SAFETY`, `OTHER`. Status: `OPEN` or `RESOLVED`. Status reason: `CUSTOMER_REQUEST`, `ANSWERED`, `DUPLICATE`, `FOLLOW_UP`, `OTHER`. Subject is 3–120 characters, single line. Message body is 1–2,000 UTF-16 units and <=8,000 UTF-8 bytes after trimming, excluding control characters except tab/newline/carriage return. Maximum 2,000 messages/thread and 1,000,000 thread versions; at those limits a new write returns a controlled conflict rather than overflowing storage counters.

History keysets are sequence based; ticket lists use immutable UUID order, not a claim of newest-first chronological order. Query one extra row for an accurate next cursor. Read cursors record client acknowledgement, not proof of human reading or peer delivery. They never move backwards across simultaneous devices.

## Transactions, retry and errors

Fresh authorization precedes every read/write/replay. Job operations take sorted participant identity locks and the owning job lock before the communication thread. Support operations take sorted actor/owner identity locks before the thread. Actor locks serialize create-ticket identity/open-count decisions; the thread lock serializes sequence, status, cursor and receipt allocation. No Redis lock or in-memory busy flag determines correctness. No provider call occurs inside a transaction.

For ticket creation, sends and status changes, generate one UUID v4 key per deliberate action. Keep the same key and canonical body through a network error, lost response or ambiguous 500/503. Same actor/action/key/input returns the original receipt after fresh authorization; different input returns `409 IDEMPOTENCY_CONFLICT`. Persisted identities do not automatically expire or become reusable. A replay occurs before writable/version checks, so a committed message remains recoverable after a ticket resolves or a job ends. Revocation or lost participant access still blocks replay. A deliberately new message/change gets a new key.

| Result | Recovery |
| --- | --- |
| 400 `VALIDATION_ERROR` | Fix bounded/schema input; do not repeat invalid input indefinitely. |
| 401 | Refresh/sign in; retain an unresolved action key. |
| 403 `FORBIDDEN` / `RECENT_MFA_REQUIRED` | Obtain the required current permission/MFA. A job chat has no staff override. |
| 404 `NOT_FOUND` | Missing or unavailable conversation/job; possession of an ID/key is not access. |
| 409 `IDEMPOTENCY_CONFLICT` | Resolve the original action; do not silently replace its key. |
| 409 `CONVERSATION_READ_ONLY`, `MESSAGE_LIMIT`, `VERSION_LIMIT` | Stop new writes and fetch current metadata; an original accepted receipt may still replay. |
| 409 `VERSION_CONFLICT`, `INVALID_TRANSITION` | Fetch current ticket, review intended transition and submit a deliberate new command if appropriate. |
| 409 `TICKET_LIMIT`, `CURSOR_AHEAD` | Resolve existing tickets, or resync history before acknowledging. |
| 429 / 503 | Respect `Retry-After` when provided, use bounded backoff with the same unresolved key and REST resync. No local fake success. |

Initial account request quotas, additional to global REST: send 30/min, read 120/min, ticket create 5/day, job-thread open 20/min, cursor ack 60/min, ticket status 10/min. Attempts/replays consume quotas too; when creation is throttled, the owner list/history remains an independent recovery path. Five open tickets/opener are enforced transactionally, including reopen by staff. Redis admission failure rejects before new transaction work. There is no financial/custody/job transition in ticket resolution.

Accepted thread/message/status changes persist a matching `communication_events` intent in the same transaction. Events contain controlled type, IDs, aggregate version, optional message sequence/reason and timestamp; never body/subject/credentials. They form durable history for a future notification relay. **No publisher, push delivery, chat socket broadcast or worker acknowledgement is enabled here.** A later relay needs its own durable attempts/leases/dedup and fresh recipient authorization before delivery. The financial outbox and workers are unchanged.

## Database and local configuration

Migration source: `backend/prisma/migrations/20261120000000_communications_chat_tickets/migration.sql`. Adds:

| Table | Purpose |
| --- | --- |
| `communication_threads` | Unique job conversation or owner support ticket, version/state and last sequence. |
| `communication_messages` | Immutable authored, sequenced plain-text history. |
| `communication_read_cursors` | Private monotonic cursor per thread/account. |
| `communication_commands` | Scoped immutable key fingerprints and command receipts. |
| `communication_events` | Immutable versioned event/outbox intents with references only. |

Source schema now defines **50 application tables** (five new). The last identified applied `zipp_dev` evidence still records **45 tables and base marker `m6`** from M6; this pass did not connect to or change that database. The migration adds separate metadata `communications=m7_2`. Base readiness remains `m6`; communications stays disabled without its schema. Enabled communications checks its marker at bootstrap and fails startup if missing, rather than advertise a ready feature with absent tables.

`COMMUNICATIONS_ENABLED=false` is the API-only default in example env/Compose. Enabled local mode also requires `AUTH_ENABLED=true`; job chat needs the respective ride/delivery flag. Production enablement is rejected pending acceptance. Worker environment/consumers are unchanged. No ignored env values were changed. To use later, first identify the actual local migration target, review/apply additive migrations through the existing migration-owner path, regenerate/build, then explicitly opt in and restart API. Do not apply/reset an unidentified database or run test stacks as a setup shortcut. Ordinary Compose application startup already has a migration job: reviewing the migration target is required before that future startup too.

SQL adds bounds, shape/foreign-key constraints, a partial unique job-thread index, immutable message/receipt/event grants and deferred contiguous message/event consistency guards. The runtime can update only thread status/version/sequence/timestamp and cursor sequence/timestamp. A body or partial event mismatch must roll back; SQL execution and privilege evidence remain pending. The offline Prisma SQL rendering is only a model/migration comparison, not clean/upgrade execution.

No automatic purge is enabled. A proposed 90-day post-terminal/resolution content window requires a separate approved retention/archive design, privacy review and bounded implementation. Active/unresolved/legal-hold cases and retained duplicate-prevention identities must remain safe. Current foreign keys/append-only privileges intentionally prevent ad hoc content deletion.

## Unrun acceptance and next work

Written source covers policy/limits, fresh authorization/replay, HTTP validation/security/error privacy, actual PostgreSQL sequence/idempotency/status/open-limit races, rollback/immutability, monotonic cursors and owning ride/delivery context restrictions. All tests remain **unrun** by user instruction. Apply the migration to identified isolated test infrastructure only when testing is commanded, and verify clean/upgrade/privilege/schema behavior separately from compilation.

Before acceptance, exercise sends against actual termination/reassignment and session/role/MFA changes, multi-instance writers, saturation/Redis/DB loss and reconnect history. Measure indexed query and lock costs, including deferred guards at the 2,000-message bound. Connect mobile chat/support UI with safe rendering, retained action keys, foreground polling/backoff, account/focus cleanup and native accessibility checks. Push/devices, call media/native integration, broader staff operations and measured realtime fanout remain M7 work.
