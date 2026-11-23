# M7 completion checklist — M8 stays on hold

2026-11-23 sequencing update: the user subsequently authorized moving to M8 and selected Smobilpay. This supersedes the M8 hold stated in the historical checklist below. M7 remaining implementation/acceptance stays open; see [M8 plan](M8_PROVIDERS.md) and [ADR 0017](adr/0017-m8-smobilpay-provider-selection.md). No test or live-provider authorization is implied.

Updated 2026-11-23. User direction: complete M7 before moving to M8. Tests still require an explicit command; phase-end is not testing authorization. Source/build checks do not close runtime, security, media or native gates.

| Work | Current evidence | Remaining before M7 completion |
| --- | --- | --- |
| Private realtime | Default-off bounded participant stream and foreground delivery integration source. | Authorized cross-replica/session/Redis/reconnect/load/native verification; ride demo conversion remains separate mobile integration work. |
| Persistent chat/support | Backend source and foreground Messages/support/delivery conversation source. | Runtime/native/network/storage/retry/role acceptance; staff API exists, new admin website is outside backend scope. |
| Devices/notifications | LOCAL dummy installations, durable intents, local capture worker, own generic inbox source. | Real token/provider adapter and invalid-token/receipt contracts; mobile permissions/registration and actual background delivery. LOCAL capture is not push. |
| Staff operations | M7.5 cases/manual review, minimal owner summaries, role/MFA separation, account guards/session revocation and page report source. | SQL/privileges/concurrency/recovery and owning mixed-job/finance verification; retention policy. Existing owner adjustment/refund/return/reconcile actions remain the only effect paths. |
| Call controls | M7.4 diagnostic create/claim/end/encrypted signaling/reaper source. | Usable media lifecycle/teardown, relay credentials, native incoming calls and independent audio acceptance. CONNECTING metadata alone is not an audio call. |
| Media choice | User chose self-hosted WebRTC/TURN; ADR 0016 and non-executable coturn review template. | Published version/plugin/native compatibility, image pin/relay config, Android/iOS build, OS integration and secrets/accounts configuration. No calling SDK or TURN service is installed/started. |
| Database | 61 application models and four additive M7 migration files. | Apply on identified local target after Docker/database is available. Last applied evidence remains 45/base m6. A 2026-11-23 connection attempt failed; Docker engine pipe was unavailable. No migration/reset/seed ran. |
| Verification | Allowed source/test-source compilation, lint, formatting, contracts and static checks recorded separately. Tests written, unrun. | Explicit test command; actual SQL/runtime/native/media/fault/capacity evidence. No security/1,000-user/concurrent-audio claim. |

## Inputs and local prerequisites

Requested from user: Android application ID, iOS bundle ID, and whether Firebase/Apple developer and push accounts exist. The app currently declares none of these IDs or push configuration. Share only identifiers/account availability; put private credentials in an approved local secret store. No invented production app identity, provider token or project is introduced.

Docker Desktop/engine and the existing development PostgreSQL service must be available before the identified local migration step. Target configuration is 127.0.0.1:55432/zipp_dev as zipp_owner, not a production database. Re-identify the actual connected database/markers before applying forward migrations; never reset. No engine launch, service start or existing-container restart was performed in this pass.

## Sequence from here

1. Resolve native app identifiers and provider-account availability; select published compatible SDK/plugin/native versions with recorded primary-source evidence. Preserve current mobile versions and custom configuration.
2. Implement self-hosted relay credential/usable media/teardown and OS incoming-call paths, and real push registration/delivery within M7. Keep all paths off until qualified. Do not send raw signaling/audio through queues or durable history.
3. Identify/apply the four additive M7 migrations when the existing local database is available; compile/build affected artifacts.
4. On explicit testing command, run isolated suites and targeted device/media/race/recovery/latency checks, fix findings and record actual evidence. Later M9 pilot/capacity gates remain separate.
5. Mark only verified scope complete; start M8 only after M7's required implementation and acceptance are actually satisfied.

Read [operations](M7_OPERATIONS.md), [mobile communication](M7_MOBILE_COMMUNICATIONS.md), [calling](M7_CALLING.md), [self-hosted ADR](adr/0016-m7-self-hosted-calling-direction.md) and [verification evidence](M7_VERIFICATION.md). No deployment, paid service, release workflow or M8 provider activation is authorized by this checklist.
