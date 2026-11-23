# M7.4 local call control and signaling

2026-11-23 continuation: the user selected **self-hosted WebRTC/TURN**; see [ADR 0016](adr/0016-m7-self-hosted-calling-direction.md) and [M7 completion checklist](M7_COMPLETION_CHECKLIST.md). This resolves the managed-versus-self-hosted direction only. The diagnostic implementation below still has no audio/native SDK/TURN credentials or OS push. Native app IDs/push-account availability were requested, and published SDK/plugin compatibility plus relay/media/native implementation remain open. M8 stays on hold.

Updated 2026-11-21. **Backend foundation source, migration file, contracts and test source are present. Tests, migration application, runtime/security/race, native/provider/media and capacity acceptance are pending. M7 calling is not complete.** Read [ADR 0014](adr/0014-m7-call-control-and-ephemeral-signaling.md), [live tracking/calling reference](LIVE_TRACKING_AND_CALLS.md), [M7 evidence](M7_VERIFICATION.md) and [device ownership](M7_NOTIFICATIONS.md).

## What this slice provides

`backend/src/modules/calling/` owns call-control state, account reservations, scoped command receipts, metadata events and bounded ephemeral negotiation. The API exposes private REST commands/recovery; the existing worker gains an opt-in reaper. Reuse existing PostgreSQL/Redis/identity/device ownership with no package/image upgrade, new container, paid service or native permission. Mobile source is unchanged.

The only adapter is `local_control`. Capabilities report `audioAvailable:false`, `turnCredentialsAvailable:false`, `nativeIncomingCalls:false`, `signaling:"REST_EPHEMERAL"`. No audio stream, TURN secret/credential endpoint, provider room, media-connected command, VoIP/ordinary incoming-call push, OS call UI, phone fallback or recording exists in this slice. A RINGING row is durable control metadata, not proof that a phone rang. An accepted call becomes CONNECTING, not CONNECTED. Client reports cannot invent media success.

Do not attach real microphone/provider media to this diagnostic path as if teardown were implemented. Ending backend state or expiring credentials would not itself prove a peer audio stream stopped. Real media requires a separate provider versus self-hosted/relay privacy decision, native compatibility spike, credential/teardown implementation and device/network evidence. M7.1 live sockets stay read-only and do not silently become signaling gateways; a future provider SDK must not run a competing negotiation system alongside this one.

## Eligible parties and devices

| Job | Eligible pair |
| --- | --- |
| Ride | Current customer and assigned driver, in either call direction, while the job is nonterminal. |
| Delivery | Current courier and one booker/verified bound sender/recipient, in either direction, while nonterminal. No sender-to-recipient direct call. |

The owning ride/delivery public facade loads current participants, locks sorted user IDs plus requested peer then job/aggregate, rechecks state/assignment and validates the pair. No self call, public phone directory, unverified contact capability, staff-role override or client-selected identity. Current peer account must be active. Wrong/terminal/unassigned pair is rejected. Revocation/changed job immediately blocks further negotiation authorization; a socket disconnect does not by itself release a call or mobility job.

M7.3 installations remain **LOCAL dummy registrations**, not proof of actual hardware/provider possession. Caller creates with its client-owned installation proof and binds the exact current session/device/generation. The first valid callee acceptance records its session/device/generation atomically. Other signed-in callee devices can inspect their own minimal call metadata but cannot negotiate or end the accepted leg. Token refresh preserving the same session is supported; changing login session requires a new eligible call, not stealing the old claim. Missing/revoked/expired/rotated installations or sessions deny signaling.

Metadata snapshots are private to original call participants, including historical snapshots after a job ends; they contain no job/contact/peer phone, device proof or SDP/ICE. Negotiation and answer require current job eligibility. END permits an original claimed leg to release its own call even after job eligibility changes; it cannot alter ride/delivery status, assignment, custody or funds. Terminal END is harmless. There is no staff history/force-connected override.

## REST contract

Prefix `/api/v1`; bearer access authentication, no-store responses, strict bounded schemas and shared rate limits apply to every endpoint. Device credentials are `{deviceId,deviceGeneration,proof}` in JSON body only. IDs/command keys are UUID v4. Do not place proof/access tokens/signaling in query/URL, map bridges, logs or metrics.

| Method/path | Contract |
| --- | --- |
| `GET /calling/capabilities` | Explicit local-control capability limits; no media availability. |
| `POST /calling/calls` | Device credentials plus `{jobType,jobId,peerUserId}` and Idempotency-Key; commits RINGING and both account slots. |
| `GET /calling/calls/active` | Own active minimal snapshot or `{call:null}`; timeout can reconcile own stale call. |
| `GET /calling/calls/:id` | Original participant's minimal authoritative snapshot; timeout reconciliation commits. |
| `POST /calling/calls/:id/accept` | Device credentials + `{expectedVersion}`, Idempotency-Key; first eligible callee claims CONNECTING. |
| `POST /calling/calls/:id/reject` | Same action contract; callee may reject only RINGING. |
| `POST /calling/calls/:id/end` | Same action contract; original claimed leg ends/cancels, or recovers a terminal result. |
| `POST /calling/calls/:id/signals` | Device credentials + `{epoch:1,packet:{messageId,sequence,payload}}`; no durable command key because packet identity/sequence is the ephemeral dedup boundary. |
| `POST /calling/calls/:id/signals/read` | Device credentials + `{epoch:1,afterSequence}`; read counterpart only, max 32 packets. POST keeps proof out of URL/query. |

Create/control successes return immutable `{callId,version,status}` receipts after commit. Same actor/action/key and canonical input replays that original receipt after fresh authorization; changed input is `409 IDEMPOTENCY_CONFLICT`. GET recovers current state, since a receipt can truthfully describe an earlier RINGING/CONNECTING version after the call has ended. Raw proof is HMAC fingerprinted and excluded from records/events. No automatic key expiry/reuse or cleanup is enabled. A failed/unauthorized request is not an accepted command; timeout cleanup can commit while the attempted answer returns an expired conflict.

Snapshot shape is ID, status/version, actor role, signal epoch, ring/connect expiry, accepted/ended/created timestamps, safe end reason and `audioAvailable:false`. No push token, raw proof, SDP/ICE, media secret or phone disclosure. Active snapshots can return null if another transaction closed/replaced the observed slot; recover by refetching, not inventing state locally.

## State, concurrency and recovery

Creation commits RINGING, caller/callee reservation rows, version-1 metadata event, scoped command receipt and audit intent together. PostgreSQL primary key on `active_call_participants.user_id` protects one active call/account across bookings and devices; `(call_id,side)` is unique. Admission uses transaction-scoped advisory lock and an initial cap of 100 local control sessions. One account cannot win two calls by reaching different API instances. A symmetric persisted pair cooldown is 30s, caller-create quota five/minute; action quota 30/minute and signal/read categories 60/minute, in addition to global REST limits. Retries consume quotas.

First valid ACCEPT under current identity/job/call locks transitions RINGING -> CONNECTING, binds the callee claim, increments version and creates an accepted event/receipt. Later devices lose with `CALL_ALREADY_ANSWERED`; the call never has two accepted endpoints. Reject/end/timeout races serialize on the same locks/version/slots. Terminal states REJECTED/MISSED/FAILED/ENDED cannot return to RINGING/CONNECTING. SQL deferred guards require matching event/version and exactly two correctly owned active slots, or zero terminal slots. These are reviewed source constraints, not executed SQL/race evidence.

Ring deadline is 30s. Accepted local CONNECTING has a 30s negotiation deadline and becomes FAILED with CONNECT_TIMEOUT because no media-connected state is implemented. Ring expiry becomes MISSED. Revoked/inactive/expired claimed endpoints become FAILED/PARTICIPANT_UNAVAILABLE. User END and callee rejection use controlled reasons. Cleanup updates only call state/slots/events, never mobility assignments or financial reservations. Expired answer cleanup commits before its 409 response, rather than being rolled back with the error.

The worker reaper, default off, scans at most 20 nonterminal calls in persisted oldest-check order every two seconds. It locks original identities then call, checks deadlines/account/session/device generation and closes or records check time. It never uses API JWT-signing/enrollment or signal-encryption keys. It stops between candidates on shutdown; the existing 60s worker drain applies. Concurrent reapers are safe under PostgreSQL locks; runtime evidence is pending. Job completion/reassignment denies signal access immediately at the next authorization; absent commands, finite local deadlines bound residual slots. Session/device cleanup cadence depends on backlog/DB availability; no instantaneous worldwide teardown or media termination is claimed.

## Ephemeral signaling

The caller's sequence 1 is OFFER, callee's sequence 1 ANSWER; later packets are ICE. Each direction is bounded to 64 packets/accepted epoch. SDP is <=8 KiB and ICE candidate <=1 KiB in UTF-8, with corresponding character bounds and global 16 KiB request cap. ICE fields include bounded optional/null mid/line index; payload is opaque diagnostic negotiation, not verified WebRTC SDP/ICE correctness or audio. No restart/renegotiation epoch beyond 1 is implemented; end/recreate rather than silently resetting sequence after lost state.

The API authorizes current job, accounts, both bound endpoints and the requesting exact device/proof in a short transaction. It then encrypts/writes or reads cache Redis **after the transaction ends**, followed by a second transaction reauthorizing the exact current version/epoch/device before returning. This prevents stale cached permission from returning a signal after a terminal/reassignment/revocation race; the finite in-flight authorization window is not an instant revocation guarantee. No Redis/network calls are held inside a database transaction.

Node AES-256-GCM encrypts packet payload with per-packet nonce and AAD binding call/epoch/direction/sequence/message ID. HKDF separates encryption/fingerprint keys from dedicated API-only `CALL_SIGNAL_KEY`. Only encrypted envelopes/cursors/fingerprints enter disposable cache Redis, never PostgreSQL/outbox/queue/history. Redis Lua atomically checks contiguous sequence, UUID/fingerprint replay, packet cap and absolute deadline. Replays do not extend retention past the negotiation deadline; hard buffer bound is 60s. Ending a call relies on fresh authorization plus finite encrypted-key expiry; explicit cache deletion is not required or currently scheduled.

Sender gets accepted sequence, without a payload echo. Receiver gets counterpart packets only, last sequence and resync flag. Redis eviction/loss after a nonzero cursor or sender sequence produces resync-required; do not assume missing packets were delivered or revive ended state. An initial empty read is permitted before any packet arrives. Malformed/tampered/cross-call encryption fails safely. Backend database/session/key failures do not become fake negotiation success. Private Redis/auth/TLS and key rotation still need environment qualification.

## Configuration, schema and safe errors

| Setting | Default | Behavior |
| --- | --- | --- |
| `CALLING_ENABLED` | false | Enables local control only; requires identity/notifications on API and optional calling schema marker. |
| `CALLING_ADAPTER` | local_control | All other adapters and production enablement rejected. |
| `CALL_SIGNAL_KEY` | empty | Dedicated random 32-byte hex key on API only; cannot equal configured identity/notification keys. Never mobile public config/log/Git. |
| `CALLING_REAPER_ENABLED` | false | Worker-only; needs calling/notification storage enabled but no API identity or signal keys. |

Notifications configuration and its dedicated data key remain required for installation eligibility; ordinary notification dispatch can stay off. No ignored env/flags were changed and no server/worker/provider was started. Signal-key rotation loses only ephemeral negotiation; stop/reconcile active local calls and start a fresh epoch/call rather than pretending buffers survived. Persistent command fingerprints remain tied to the identity digest-key lifecycle; retain key identities and use GET recovery, never blind new creation after an ambiguous prior outcome.

Migration `backend/prisma/migrations/20261121000000_call_control/migration.sql` adds `call_sessions`, `active_call_participants`, `call_commands`, `call_events`, owner-consistent device/session/job foreign keys, state/claim/deadline checks, global admission, slot/event consistency, indexes and restricted grants. Source defines **58 application tables**. The three M7 migrations are **unapplied here**; last identified applied local evidence remains 45/base marker `m6`. Enabled calling checks `calling=m7_4`, `notifications=m7_3`, `communications=m7_2`. Disabled features retain base readiness `m6`. Identify/review actual target before future migration/application startup; Compose already has a migration job. No reset or seed is part of this implementation.

400 handles schema/byte limits; 401 handles invalid/expired/revoked authentication; 403 forbids wrong role; 404 hides unavailable call/device/job. Expected conflicts use 409 codes such as CALL_NOT_ELIGIBLE, CALL_BUSY, CALL_CAPACITY, CALL_COOLDOWN, CALL_VERSION_CONFLICT, CALL_ALREADY_ANSWERED, CALL_DEVICE_NOT_CLAIMED, CALL_TERMINAL, CALL_EXPIRED, CALL_NOT_READY, IDEMPOTENCY_CONFLICT and SIGNAL_SEQUENCE_CONFLICT/SIGNAL_RESYNC_REQUIRED. Refetch current state and retain unresolved command keys. Shared quotas use 429/Retry-After; controlled feature/cache dependencies use 503 with safe retry metadata. Do not echo raw SDP/device proof/connection/provider errors.

Metadata retention/archive requires product/privacy approval (proposed 30 days after terminal); no automatic deletion/key reuse is introduced. Raw signaling has only its short cache lifetime and is never general telemetry. No recording or end-to-end media encryption claim.

## Written tests and remaining gates

Policy/schema/config, source authorization/claim/replay/deadlines, transaction-free Redis I/O, second authorization after signal reads, terminal recovery/reaper stop; actual ride PostgreSQL duplicate/opposite create and two-device answer races, committed expiry and device-loss cleanup; delivery pair eligibility; isolated real Redis encryption/idempotency/order/TTL/eviction/tamper; private HTTP/schema/no-media capability tests are written, **unrun**. Doubles are identified: unit/HTTP tests do not prove database/native behavior, and Redis tests alone do not prove job authorization.

On explicit command, still verify identified isolated clean/upgrade migrations/triggers/grants, all suites and broader mixed call/job termination/reassignment/race cases, process crash/Redis/DB loss, clock skew, reaper backlog/shutdown, pool/memory/burst limits and retention. Actual media provider/relay/privacy selection, microphone/native SDK compatibility, OS incoming-call handling, background/network transitions, credential issuance/revocation/teardown, bidirectional audio and the separate 100-audio-session benchmark remain unimplemented/unverified. M7 calling remains incomplete until those gates are satisfied; broader staff operations are the next independent M7 slice.
