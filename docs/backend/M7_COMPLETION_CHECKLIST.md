# M7 completion checklist — M8 stays on hold

2026-11-24 step3: [authorized diagnostic relay credentials](M7_RELAY_CREDENTIALS.md) and [ADR 0020](adr/0020-m7-scoped-relay-credentials.md) are implemented/default-off, with source/build/static contract evidence only. Source is now 61 tables/139 REST operations, same four unapplied M7 migrations. Tests/real issuance/relay/native flows unrun. User requires healthy calls to end through participant hang-up, without arbitrary conversation-duration cutoff; ongoing media/renewal/liveness/reconnect/teardown is next and remains unimplemented.

2026-11-24 foreground update: [local relay configuration/preparation](M7_TURN_RELAY.md) and [ADR 0019](adr/0019-m7-local-turn-relay.md) are present after the Android native build. One separate opt-in coturn profile, exact image/platform metadata and source checks; no image pull, private output, relay startup or tests. Next source work is authorized temporary credentials, ongoing media/renewal/teardown/reconnect and foreground mobile audio. Runtime/native acceptance remains pending on command; incoming push follows actual foreground voice.

2026-11-23 sequencing update: the user subsequently authorized moving to M8 and selected Smobilpay. This supersedes the M8 hold stated in the historical checklist below. M7 remaining implementation/acceptance stays open; see [M8 plan](M8_PROVIDERS.md) and [ADR 0017](adr/0017-m8-smobilpay-provider-selection.md). No test or live-provider authorization is implied.

Current foreground sequence: the user returned to actual M7 voice, finishing it step by step before incoming-call push. [Native foundation](M7_NATIVE_VOICE.md) and [ADR 0018](adr/0018-m7-foreground-native-voice-foundation.md) now record exact SDK installation and allowed Android build evidence. This supersedes the no-SDK status in older slice notes, not the remaining media/native acceptance gates.

Updated 2026-11-23. User direction: complete M7 before moving to M8. Tests still require an explicit command; phase-end is not testing authorization. Source/build checks do not close runtime, security, media or native gates.

| Work | Current evidence | Remaining before M7 completion |
| --- | --- | --- |
| Private realtime | Default-off bounded participant stream and foreground delivery integration source. | Authorized cross-replica/session/Redis/reconnect/load/native verification; ride demo conversion remains separate mobile integration work. |
| Persistent chat/support | Backend source and foreground Messages/support/delivery conversation source. | Runtime/native/network/storage/retry/role acceptance; staff API exists, new admin website is outside backend scope. |
| Devices/notifications | LOCAL dummy installations, durable intents, local capture worker, own generic inbox source. | Real token/provider adapter and invalid-token/receipt contracts; mobile permissions/registration and actual background delivery. LOCAL capture is not push. |
| Staff operations | M7.5 cases/manual review, minimal owner summaries, role/MFA separation, account guards/session revocation and page report source. | SQL/privileges/concurrency/recovery and owning mixed-job/finance verification; retention policy. Existing owner adjustment/refund/return/reconcile actions remain the only effect paths. |
| Call controls | Diagnostic create/claim/end/encrypted signaling/reaper and default-off scoped setup credential issuer source. | User-ended ongoing media/renewal/liveness/reconnect/teardown, native incoming calls and independent audio acceptance. CONNECTING metadata/setup grants alone are not an audio call. |
| Media choice | Self-hosted WebRTC/TURN; exact WebRTC 155.0.1/dev-client 58.0.21 installed; Android ARM64 debug APK assembled/statically inspected. Local coturn image pin/profile/private preparation plus API-only setup issuer/secret override source and Compose checks present. | iOS native build, actual issuer/key/relay/permissions/network and Android/iOS runtime qualification; ongoing authorized renewal/media/teardown/reconnect and OS integration. No TURN service or usable audio enabled. |
| Database | 61 application models and four additive M7 migration files. | Apply on identified local target after Docker/database is available. Last applied evidence remains 45/base m6. A 2026-11-23 connection attempt failed; Docker engine pipe was unavailable. No migration/reset/seed ran. |
| Verification | Allowed source/test-source compilation, lint, formatting, contracts and static checks recorded separately. Tests written, unrun. | Explicit test command; actual SQL/runtime/native/media/fault/capacity evidence. No security/1,000-user/concurrent-audio claim. |

## Inputs and local prerequisites

Requested from user: store Android application ID, iOS bundle ID, and whether Firebase/Apple developer and push accounts exist. The native foundation uses reversible development-only `com.zipp.app.dev`, with an explicit override; no store identity or push account is selected. Foreground Android preparation does not depend on push accounts. Share only identifiers/account availability; put private credentials in an approved local secret store. No invented production app identity, provider token or project is introduced.

Docker Desktop/engine and the existing development PostgreSQL service must be available before the identified local migration step. Target configuration is 127.0.0.1:55432/zipp_dev as zipp_owner, not a production database. Re-identify the actual connected database/markers before applying forward migrations; never reset. No engine launch, service start or existing-container restart was performed in this pass.

## Sequence from here

1. Android native foundation compilation/packaging is recorded in the native guide; preserve its reviewed versions, development ID and custom configuration. iOS native compilation and actual Android/iOS runtime qualification remain separate open gates. Do not equate the APK with a usable foreground call.
2. Local relay configuration and authorized diagnostic setup credential source are present; continue with foreground media/ongoing-call/renewal/liveness/epoch/teardown/reconnection, preserving participant-ended healthy conversations without arbitrary duration cutoff. Relay/issuer/runtime/media checks remain unrun until commanded. Then implement OS incoming calls and real push registration/delivery, resolving store identities/accounts when needed. Keep all paths off until qualified. Do not send raw signaling/audio through queues or durable history.
3. Identify/apply the four additive M7 migrations when the existing local database is available; compile/build affected artifacts.
4. On explicit testing command, run isolated suites and targeted device/media/race/recovery/latency checks, fix findings and record actual evidence. Later M9 pilot/capacity gates remain separate.
5. Mark only verified scope complete; start M8 only after M7's required implementation and acceptance are actually satisfied.

Read [operations](M7_OPERATIONS.md), [mobile communication](M7_MOBILE_COMMUNICATIONS.md), [calling](M7_CALLING.md), [self-hosted ADR](adr/0016-m7-self-hosted-calling-direction.md) and [verification evidence](M7_VERIFICATION.md). No deployment, paid service, release workflow or M8 provider activation is authorized by this checklist.
