# Live maps, tracking and voice calls

2026-11-24 user call-ending rule: a healthy ongoing conversation has no arbitrary duration cutoff and ends when either claimed participant hangs up. Credential expiry remains a security/renewal concern, distinct from call duration; revocation, job termination and abandoned connections still need bounded teardown. [API setup credentials](M7_RELAY_CREDENTIALS.md) and [ADR 0020](adr/0020-m7-scoped-relay-credentials.md) implement the next default-off credential slice only; ongoing media/renewal/liveness/epoch/reconnect and mobile teardown remain pending. Existing finite diagnostic setup deadlines must not be removed or treated as a usable ongoing-call contract. Build/static checks only; tests/real issuance/native/audio remain unrun.

2026-11-24 foreground continuation: Android native foundation build evidence is in [native guide](M7_NATIVE_VOICE.md). [Local TURN configuration](M7_TURN_RELAY.md) and [ADR 0019](adr/0019-m7-local-turn-relay.md) add a separate opt-in image-pinned coturn role/private preparation with same-container relay-only peer restrictions. Source checks only; no private output, relay startup, tests or audio. Actual authorized credentials, ongoing media/renewal/teardown/reconnection, iOS and incoming push remain pending; current backend is diagnostic/default-off. The local profile is not the public relay/NAT/TLS architecture described below.

Established 2026-11-06. Status: required design and acceptance reference, not implemented functionality. Read alongside [architecture](ARCHITECTURE.md), [capacity](CAPACITY.md), [infrastructure](INFRASTRUCTURE.md) and [dependency policy](DEPENDENCY_POLICY.md).

## 1. Responsibilities and product boundaries

Live tracking and audio calling use separate data paths. NestJS authorizes participants and owns business/session state. Socket.IO carries bounded location/signaling messages. A map renderer displays coordinates and routes. WebRTC transports audio directly or through a media relay. Background workers deliver notifications and reconciliation work; they never carry a continuous audio stream.

Keep the current mobile MapLibre/WebView display as the initial integration candidate. Replace simulated driver coordinates through a typed adapter; do not rewrite the map solely to add backend tracking. A native renderer change needs a compatibility/performance ADR and tests. Map rendering, map tiles, place search, routing, navigation and live location are separate responsibilities with separate provider limits and licenses.

Calling scope is one-to-one customer/assigned-driver audio during an eligible ride/delivery. No group call, video, call recording or public calling directory in the initial scope. Phone dialer fallback is separate from internet audio and reveals the dialed number unless a verified masking provider is integrated. Do not silently expose a private phone number as fallback.

## 2. Component ownership

| Component | Owns | Does not own |
| --- | --- | --- |
| Driver mobile location adapter | Permissions, foreground/background capture, battery-aware cadence and local freshness | Authoritative fare, job assignment or completion |
| `tracking` module | Location sessions, eligibility, validation, latest snapshot, participant subscriptions and retention | Tiles, full routing engine or financial state |
| `pricing`/routing adapter | Server route-derived quotes, route/ETA provider boundary and quotas | Trusting client distance as financial truth |
| API/Socket.IO gateways | Authenticated location commands, subscriptions and call signaling | Continuous audio transport |
| Redis cache/presence | Latest location with TTL, temporary presence and bounded fanout | Durable job state or complete audit history |
| PostgreSQL | Job state, authorized participants, sampled checkpoints, call metadata and audit policy | Every unbounded GPS packet or audio content |
| `calling` module | Participant eligibility, sessions, device answer claim, credentials, lifecycle and abuse limits | Audio codec processing in Nest handlers |
| WebRTC/TURN or selected media service | Negotiated encrypted audio and connectivity/relay | Booking authorization or wallet decisions |
| Notifications/native mobile integration | Best-effort incoming-call notification, OS call UI/audio lifecycle | Guaranteed device wakeup or automatic call acceptance |

Add `tracking/` and `calling/` as feature modules with the same domain/application/ports/infrastructure/presentation boundaries defined in the architecture. Select direct WebRTC plus TURN versus a managed calling service through an ADR; no provider or native package is chosen by this document.

## 3. Location publishing flow

1. Driver authenticates, obtains approved online/job eligibility and a server-created location-session identity. Offline/ineligible accounts cannot publish useful dispatch presence.
2. Mobile collects latitude, longitude, accuracy, optional heading/speed, capture timestamp and sequence number. Normal online/active cadence is roughly 3-5 s, configurable for battery/network/movement; exact timing is not guaranteed by an OS.
3. Send a bounded `location.update` command through authenticated Socket.IO. Background collection must have a native-supported upload path, such as an authenticated bounded HTTPS batch endpoint, when a persistent socket is unavailable. Do not assume JavaScript/sockets run continuously in the background.
4. Backend derives driver identity from the session, validates eligibility, shape/size/range, finite coordinates, accuracy, age, session/sequence and shared rate quota. Client-supplied driver/job identity is never authorization.
5. Atomically accept only a newer sequence for the current server-issued session; stale/replayed updates cannot overwrite a newer position across API replicas. Handle process/device restart with a new authorized epoch rather than accepting arbitrary sequence resets.
6. Store the latest accepted position, observed/capture times and freshness expiry in Redis. Append selected checkpoints under the PostgreSQL retention policy. An old offline batch may inform history but cannot revive current dispatch presence.
7. Emit a minimal position update to authorized active-job participants. A bounded nearby-driver discovery view may show coarse/filtered availability under a separate privacy policy, never an unrestricted feed of all drivers.
8. Mobile interpolates marker movement between positions, displays accuracy/freshness and uses backend job state to choose the experience.

Proposed command fields: `schemaVersion`, `locationSessionId`, `sequence`, `capturedAt`, `latitude`, `longitude`, `accuracyMeters`, optional `headingDegrees` and `speedMetersPerSecond`. Proposed server event adds server-derived driver/job association where permitted, `receivedAt` and location version. Freeze actual DTOs/error codes in contract tests before implementation.

Coordinates are device-reported observations, not proof against GPS spoofing. Check implausible jumps, clock skew and invalid accuracy; record reviewable anomalies rather than automatically changing money/penalties from one noisy point. Completion/assignment policies require their own server-side verification.

## 4. Map rendering, route and ETA behavior

- Keep live position separate from the planned road route. Interpolation smooths presentation and must not invent an authoritative location or replace road routing with a straight line.
- Initial route/quote comes from the server's chosen routing adapter. Recalculate after meaningful route deviation, elapsed time or destination change, with thresholds and provider budget recorded in an ADR. Never recalculate on every 3-5 s GPS update by default.
- Bound per-trip refresh concurrency, cache safe route results, deduplicate requests and handle provider timeout/rate-limit states. Refresh financial quotes explicitly; an ETA refresh cannot silently reprice a booked trip.
- Place/map tile services may receive location-related requests. Document licensing, quotas, attribution, data disclosure and retention; public/demo endpoints are not assumed to have production capacity/SLA.
- Use the existing map's typed update path and validate any WebView bridge input. Keep auth credentials out of map HTML, tile URLs and location labels.

## 5. Freshness, reconnection and background permissions

Proposed starting thresholds, subject to field testing: mark location stale after 15 s without an accepted fresh update; remove online driver dispatch eligibility after 30 s. Expired Redis keys must remove associated geo-index entries or query logic must independently exclude them. Eviction/Redis loss means unknown location, not continued eligibility.

During connection loss, display last-known position and elapsed age. Stop animating as if fresh telemetry exists. On reconnect use backoff/jitter, re-authenticate, resubscribe with authorization, fetch current job/location snapshots and reject delayed updates from earlier sessions. Socket.IO's default delivery does not recover missed server events automatically; application recovery is required. [Delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)

Keep only a bounded offline sample buffer with a retention/size limit. Never replay a long backlog through the current-location channel. Critical job transitions remain persisted/idempotent; frequent GPS samples are latest-value telemetry, not a transactional outbox entry per packet.

Request foreground location contextually. Driver background collection requires platform permissions, native task/lifecycle configuration, user-visible behavior where required and a compatible native build. Handle denied/revoked permissions, approximate/low-accuracy location, battery restrictions, screen lock, app backgrounding and termination explicitly. Do not promise tracking after force-stop or uninterrupted delivery in all OS states. [Expo location](https://docs.expo.dev/versions/latest/sdk/location/)

## 6. Internet call establishment

1. Caller requests a call session for a specific eligible booking. Backend checks current participants, job status, block/abuse policy, session limits and rate quota.
2. Persist the session and participant/device invitation state, then publish an idempotent ring event. Deliver best-effort push for background devices with a short expiry and only necessary metadata.
3. Callee accepts or rejects through an authenticated command. The first valid device acceptance claims the session atomically; other devices stop ringing. Duplicate requests and accept/hang-up races resolve from persisted versioned state.
4. Issue short-lived, session-scoped media/TURN credentials only to the authorized participants. Negotiate offer/answer and ICE candidates through bounded authenticated signaling or the chosen provider's SDK/signaling contract, not two conflicting signaling systems.
5. Audio flows over WebRTC directly where permitted or via TURN/media service when required. Relays are needed for networks where direct peer connectivity fails. [WebRTC TURN](https://webrtc.org/getting-started/turn-server)
6. Report connection/quality/ended events with operation identity. Backend verifies actor/session and performs conditional lifecycle transitions. Client-reported connection duration is operational metadata, not billing proof.
7. Hang-up/timeout/revocation ends session eligibility, cancels ringing where possible and closes client media. Expiring credentials alone do not necessarily disconnect an already established peer stream: clients and any chosen provider must implement the supported teardown path and tests.

Default privacy policy: no audio recording. Do not persist raw SDP, ICE candidate logs, microphone data or unnecessary network identifiers. Direct peer connectivity may reveal network addresses between peers; decide direct-versus-relay-only privacy policy and measure its bandwidth cost before release. Do not claim end-to-end encryption properties for a chosen managed media service without verifying its actual configuration and trust model.

## 7. Call state and persistence

Proposed states: `RINGING`, `CONNECTING`, `CONNECTED`, `REJECTED`, `MISSED`, `FAILED`, `ENDED`. Session creation validates eligibility before committing `RINGING`; duplicate create keys replay the existing session. Terminal states cannot be resurrected by delayed answer/ICE/connected events. Use state version + conditional database updates.

Store session ID, booking association, caller/callee account IDs, answer-device claim, state/version, created/ringing/accepted/connected/ended times, ring expiry, safe end reason and limited operational quality aggregates with a retention policy. Do not store media credentials or complete signaling payloads as ordinary call history.

Enforce at most one active call per account across bookings/devices through database-backed reservations/constraints, released atomically at terminal state. Reconcile abandoned nonterminal sessions with bounded leases/timeouts. A lost socket is not instant proof of call end; allow a short tested reconnect window and inspect provider/session state when available.

Proposed events: `call.ringing`, `call.accepted`, `call.rejected`, `call.connected`, `call.ended`, `call.failed`. Proposed commands: create session, accept, reject, end and bounded signaling exchange. Responses/events have ID, session ID/version, schema version, timestamp and minimal validated payload; sessions expose an authorized REST snapshot for recovery. Do not place raw offer/answer/ICE in durable outbox payloads by default.

## 8. Incoming calls and telephone fallback

Foreground socket signaling alone is insufficient for a locked/backgrounded phone. Native call integration must handle permissions, incoming-call UI, push token lifecycle, audio focus, earpiece/speaker/Bluetooth, interruption by a cellular call and user hang-up outside the React screen.

Verify Apple CallKit/PushKit and Android Telecom/background restrictions against current official policies and the selected SDK/native adapter. Use VoIP push only for valid calls and implement required OS reporting. Ordinary push delivery is not a guaranteed VoIP wake mechanism. Test denied permissions, delayed/expired/duplicate push and notification taps after session end. [Apple VoIP notifications](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit), [Android calling integration](https://developer.android.com/develop/connectivity/telecom/voip-app)

Native dependencies/configuration must be verified against the actual Expo/React Native versions and rebuilt in development and release binaries; Expo Go is not acceptance evidence for a native calling integration. Do not regenerate native projects destructively if custom native changes would be lost. [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)

A telephone fallback opens the device dialer only after an explicit user action and number-disclosure policy check. It is a cellular call with the user's carrier costs, not an automatic internet-call continuation. Number masking requires a separate eligible provider/country integration and tests; do not claim it exists by hiding the number in the screen.

## 9. Access, privacy and abuse controls

- Only current eligible participants subscribe to precise tracking or exchange call signaling. Stop access on reassignment, session revocation, account suspension or the documented post-job expiry. Driver location publishing while online does not expose precise position to every customer.
- Validate every room join/event, session ID, command size, sequence and media-credential request. Credentials are short-lived and server-issued; no static TURN secret is shipped in mobile code.
- Protect TURN against open-relay abuse: authenticated allocations, per-user/session bandwidth/allocation limits, allowed destinations as appropriate, resource limits and abuse metrics. Media must not reach private infrastructure through an unsafe relay configuration.
- Initial call quotas to test: 5 new attempts/minute/caller, at most 1 active session/account, and a peer-specific repeated-ring cooldown. Exact daily/provider quotas, ring timeout (initial 30 s) and maximum call length require policy/ADR before launch. Signal traffic and ICE candidate count have their own bounded quotas.
- Microphone permission is contextual; audio starts only after legitimate call acceptance and OS policy handling. No covert auto-answer, background recording or automatic call recording.
- Access to historical location/call metadata is restricted, audited and retained only for documented product/support requirements. Logs/metrics use redaction and bounded labels; precise coordinates, tokens and SDP are not general log fields.

## 10. Deployment and independent scaling

API/socket replicas distribute authenticated telemetry/signaling. Configure the Socket.IO adapter and transport/load-balancer policy; long-polling requires session affinity in a multi-node deployment. WebSocket-only is a deliberate alternative requiring mobile/proxy tests. [Socket.IO multiple nodes](https://socket.io/docs/v4/using-multiple-nodes/)

TURN/media relay is a separate optional deployment role after the calling ADR. If self-hosted, add a hardened pinned image, authenticated short-lived credentials, public media IP/hostname, configured UDP/TCP/TLS listener and relay port ranges, firewall/NAT rules, certificates, resource monitoring and a separate capacity budget. HTTP ingress/443 alone is not a complete media network design. If managed, document region, session limits, trust, retention, egress price and outage/fallback behavior.

Scale/location fanout is bounded by subscribers per booking and driver update cadence. Avoid global broadcasts and storing each sample synchronously in multiple DB rows. Scale media by concurrent streams, relay percentage, negotiated codec bitrate, packet overhead and egress in both directions. API user/RPS capacity does not establish audio capacity.

Separate measurements: GPS ingest rate, recipient fanout, stale-position rate, reconnect time, call setup success, accept-to-audio time, relayed-call fraction, packet loss/jitter/RTT and relay bandwidth. Never label a session healthy only because signaling connected; verify usable bidirectional audio.

## 11. Tests, release gates and sequencing

| Area | Required tests |
| --- | --- |
| Location contracts/security | Malformed coordinates, replay/old epoch, inaccurate/stale observations, spoofed identity, suspended driver and unauthorized subscriptions |
| Recovery | Redis expiry/eviction, geo-index cleanup, offline batches, resubscribe/snapshot races, API restart and reconnect storm |
| Mobile tracking | Physical Android/iOS, permissions denied/revoked, screen lock, background/termination, battery saver, weak network and accuracy |
| Call lifecycle | Two-device accept, duplicate create/end, answer vs timeout/hang-up, terminal-state replay, abandoned session cleanup and revoked participant |
| Native calling | Foreground/background/locked devices, expired push, microphone denial, Bluetooth/speaker, cellular interruption and network switch |
| Media/security | Forced TURN, restrictive networks, unreachable relay, credential expiry, relay abuse limits and bidirectional-audio confirmation |
| Scale | Existing GPS/socket load profile plus independent concurrent-call/relay/bandwidth tests; mixed calls, location and API workload |

Initial media benchmark target to validate: 100 concurrent audio sessions (200 endpoints), including a forced-relay run, >= 95% setup success and p95 <= 5 s from acceptance to bidirectional media under the documented healthy test network. These are proposed gates, not measured capacity. Real-device/network quality results must accompany any pilot claim. k6 can test API/signaling load but does not prove actual WebRTC audio quality; use a compatible media/browser/native harness and physical-device checks.

Implementation order: define tracking contracts/permissions in M4; ship authenticated tracking with rides in M5 and deliveries in M6; complete calling design/native compatibility spike and implementation in M7; verify providers in M8; run combined tracking/media/recovery qualification in M9. Keep calling disabled until its own gates pass, even if chat/maps work.

## 12. Decisions to record before implementation

Tracking/provider/licensing and checkpoint retention policy; server-issued location epoch/version contract; freshness thresholds/cadence/battery policy; background upload transport; socket adapter/transport policy; calling provider versus self-hosted WebRTC/TURN; direct-versus-relay privacy; native Expo/React Native compatibility matrix; OS push integration; recording/metadata retention; call quotas/timeouts; media capacity/cost and region. Follow [dependency policy](DEPENDENCY_POLICY.md) before selecting/installing any related package.

## M7.1 implementation note (2026-11-20)

Private participant live projection is implemented as an opt-in WebSocket-only Socket.IO stream; [ADR 0011](adr/0011-m7-participant-live-stream.md) and [guide](M7_REALTIME.md) define actual handshake/output, shared admission, origin/session/ownership checks and REST recovery. GPS intake still uses the existing authenticated HTTP epochs/sequence checks. This initial read-only three-second pull projection has no room broadcast, nearby-driver feed, geo fanout, socket mutation, background guarantee or media path. It does not meet the proposed <=2-second propagation acceptance merely by existing; runtime/native/load tests are unrun. Calling, push and their independent media/platform gates remain pending.

## M7.4 implementation note (2026-11-21)

[Local call-control/signaling source](M7_CALLING.md) and [ADR 0014](adr/0014-m7-call-control-and-ephemeral-signaling.md) implement current job/device authorization, first-device answer, PostgreSQL active-call slots, scoped command receipts, finite RINGING/CONNECTING deadlines and encrypted bounded Redis signaling over private REST. This is diagnostic control only, with default-off flags and unapplied migration. It deliberately has no CONNECTED state, audio, media/TURN credentials, native SDK/permissions, OS incoming-call push or verified ringing. M7.1 sockets remain read-only; provider signaling must be selected coherently before actual media integration. The provider/privacy/native/teardown/media tests and independent capacity gates above remain mandatory; metadata timeout does not prove an external peer stream stopped. All new tests are unrun by user instruction.

## Self-hosted direction update (2026-11-23)

User chose self-hosted WebRTC/TURN. [ADR 0016](adr/0016-m7-self-hosted-calling-direction.md) records privacy/credential/teardown/native/push requirements and candidate compatibility gaps. The current M7.4 adapter remains local_control without real audio or OS ringing. The coturn example is a review template only, not an installed/started relay or credential issuer. [M7 completion](M7_COMPLETION_CHECKLIST.md) and native app IDs/push-account inputs remain open; M8 has not started.
