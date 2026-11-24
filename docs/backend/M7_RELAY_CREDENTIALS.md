# M7 voice step 3 — authorized temporary relay credentials

Updated 2026-11-24. **Credential issuer source, configuration and OpenAPI are present; default-off. Compilation/static checks passed; tests and actual issuance/relay/media remain unrun.** Read [ADR 0020](adr/0020-m7-scoped-relay-credentials.md), [relay topology](M7_TURN_RELAY.md), [calling contracts](M7_CALLING.md) and [M7 evidence](M7_VERIFICATION.md).

## Conversation ending rule

The user selected **participant-controlled hang-up**: a healthy ongoing conversation continues until either claimed participant ends it. There is no product-defined fixed conversation-duration limit. Relay credentials expire for security; their lifetime is not a call timer. The future ongoing-call client must renew eligible credentials without an arbitrary forced hang-up and stop its peer/microphone when either participant ends the call.

This slice does not implement CONNECTED state, ongoing credential renewal, endpoint liveness, ICE restart or mobile media orchestration. The existing diagnostic call still has a 30-second RINGING deadline and a 30-second accepted CONNECTING setup deadline, then closes FAILED/CONNECT_TIMEOUT. Do not attach real audio to it or describe the ongoing conversation rule as already working. Removing setup deadlines would retain abandoned reservations indefinitely; implement a persisted ongoing-call/liveness/reconnect contract next. Revoked sessions/devices, job termination/reassignment and abandoned connections must still stop authorization and trigger bounded safe cleanup. No job/custody/hold/funds changes follow a call timeout.

## Private endpoint

`POST /api/v1/calling/calls/:id/relay-credentials` requires bearer access authentication and this strict JSON body:

```json
{
  "deviceId": "<claimed UUID v4>",
  "deviceGeneration": 1,
  "proof": "<current installation proof>",
  "expectedVersion": 2,
  "epoch": 1
}
```

Proof is body-only; no query/URL/provider destination/actor/room injection. Same global input/body limits, safe HTTP errors and no-store headers apply. Shared issuer quota is six attempts/minute/account plus ordinary global REST quota; retries count. No staff/role bypass. Existing LOCAL notification installation proof remains diagnostic and is not verified possession of native hardware or a real push token.

Only an accepted nonexpired CONNECTING call can receive a grant. Requester must be an original participant with the exact current claimed session/device/generation/proof. Current job pair/assignment, both account/session/device eligibility, version and epoch are checked under the existing identity/job/call locks. Stranger/changed/unavailable objects stay hidden; there is no client-selected relay. RINGING, terminal, setup expiry, stale version/epoch, losing devices, revoked sessions and ended/reassigned jobs fail closed. Expiry cleanup commits before the conflict response so a failed request does not roll back call-slot release.

After the first transaction ends, the infrastructure adapter computes an ephemeral grant. A second transaction rechecks current eligibility, version/epoch/claim and scope before release; no file/network/provider I/O or cryptography runs inside authorization transactions. The private key is loaded once at API initialization. A response still has a finite in-flight authorization window; no worldwide instantaneous revocation guarantee.

Successful response contains one `iceServers` entry with the two configured `turn:<private-IP>:3478?transport=udp|tcp` URLs, opaque username, temporary password, `iceTransportPolicy:"relay"`, expiry/server UTC timestamps and `audioAvailable:false`. These values must remain in mobile memory only in the future integration. Never log/capture/persist them in a response dump, event, queue, command receipt or history. This read-like ephemeral grant needs no Idempotency-Key; create/accept/end still retain their durable idempotency contracts. No new events or database records/tables are added by issuance.

## Protocol, expiry and scope

Coturn 4.19.2 expects `expiryUnixSeconds:opaqueScope` as username and Base64(HMAC-SHA1(serverASCIIKey, username)) as password. SHA1 here is coturn's authentication protocol, not password storage. Scope is purpose-separated HMAC-SHA256 over call ID, epoch, both claimed session/device/generations and requesting leg. It exposes no raw account/job/call/device IDs in the username. Scope is a server issuance boundary, **not** a TURN-enforced device/job binding: the returned username/password is a bearer credential until expiry. A copied credential can be reused within coturn's limits; future native security/abuse qualification remains required.

Diagnostic expiry is fixed to `floor(acceptedAt/1000)+60` seconds. Requests later in setup return the same grant/expiry for that leg; they do not slide it, create additional usernames or reset per-username allocation limits. The accepted call's 30-second setup deadline still gates authorization. This can leave credentials valid for roughly thirty seconds after a setup timeout, and a user END can precede credential expiry; no further issuance is allowed after END. Existing allocations/streams are not necessarily stopped immediately by credential expiry, key-file replacement or backend state. No claimed verification of coturn renewal/expiry behavior.

Ongoing audio needs a separate authorized renewal/liveness/epoch policy with client teardown and bounded reconnect; repeating this setup request must not be used as that policy. Do not erase durable financial/idempotency keys because temporary credentials expire. Coturn currently allows two allocations per temporary username and twenty in total; API admission is additional, and neither configuration proves call capacity.

## Configuration and private key

| Setting | Default | Rule |
| --- | --- | --- |
| `CALL_RELAY_CREDENTIALS_ENABLED` | false | API-only opt-in, requires enabled local calling/identity/notifications; production rejected |
| `CALL_RELAY_LAN_IP` | empty | Exact reviewed RFC1918 IPv4 listener from step2; no wildcard/public/loopback/link-local/bridge-IP or arbitrary URL |
| `CALL_RELAY_SECRET_FILE` | empty | Absolute private prepared key file, never an inline key; worker rejects this setting |

Actual backend `.env` was not read or modified. No key file was generated/read and no API/worker/container was started. Existing calling schema marker `calling=m7_4` and notifications/communications markers remain required when enabling calling. All four M7 migrations are still unapplied here; source remains 61 application tables, now **139 REST operations** after contract generation, last identified applied local evidence 45/base m6. No package, lockfile, Prisma schema, migration or mobile change in this slice.

Step2's preparation produces `infra/calling/.local/turn-shared-secret` and private coturn config with the same 64 lowercase hex ASCII key. The issuer reads only that key file, never the entire coturn config. Treat hex characters as ASCII for HMAC; do not decode to32 bytes. At startup require a bounded 64-character key with optional final LF, regular non-symlink file and matching open-file identity. Reject key reuse with configured identity/notification/signal keys. POSIX mode must exclude group/other permissions and file ownership must match the non-root API UID; Windows preparation ACLs require later actual acceptance. Parent directory/OS/Docker administrator trust still applies. Invalid/missing/unreadable enabled keys fail startup with generic messages; disabled API/worker perform no key I/O. Key memory is cleared on shutdown, without claiming full managed-runtime erasure.

Optional `infra/calling/compose.api-credentials.yaml` merges after `infra/compose/compose.yaml` and mounts only that prepared key read-only on the API; the worker gets no flag/key/mount. It is not included in ordinary startup. Use the public step2 `.env.example` only for static config review; real operator opt-in uses the reviewed prepared nonsecret Compose environment. `CALL_RELAY_CREDENTIALS_ENABLED` must be deliberately set true for actual enablement. Rootless/WSL/Desktop/secret-bind UID behavior still needs qualification. On Linux, preparation's host UID can differ from the backend image's runtime UID; **do not chmod0644, run API as root or bypass owner checks**. A reviewed owner-only key provision matching the API runtime identity is required before startup. The override does not automatically fix ownership or start the separate relay.

Stop/reconcile active use and synchronize API/relay configuration before rotating keys or changing the listener. No hot reload/repeated file reads per request, public secret env, generated production key, old-key recovery service or automatic deletion. Old allocations may survive secret replacement; actual lifecycle/revocation checks remain open.

## Evidence and remaining work

Allowed checks passed: strict source/test-source TypeScript compilation, affected calling/HTTP/integration-source ESLint, module-boundary check, production build and OpenAPI/event generation, touched-source formatting, static Compose merge validation with public example inputs. Generated operation count is139; no test runner, scanner, database/Redis/native/provider operation, key preparation, image pull/build/start or call probe. Docker CLI warns its local user config is inaccessible in this sandbox; static Compose validation still exited0 and required no login.

Written, **unrun** tests cover actual application authorization through service doubles, before-accept/stranger/admin/losing-device/session/version/endpoint rejection, deterministic retry expiry and quota, mint outside transaction, end/job/device race before release, committed setup-timeout cleanup, default-off/worker/production/config guards, bounded key files/permissions/key separation, opaque HMAC scope and ASCII coturn protocol, private HTTP validation/no-store/503 errors. Existing PostgreSQL ride suite gains real persisted claims/winning-device-only grants and post-END denial with an explicitly identified crypto/admission double. Filesystem crypto tests require non-root POSIX or Windows; source doubles do not establish actual coturn/Redis/SQL/native behavior. None has run.

Next: persisted ongoing-call/liveness/renewal/epoch and bounded reconnect/teardown, preserving participant-controlled normal hang-up, then foreground mobile microphone/peer/audio orchestration before incoming-call push. On explicit testing command, run isolated SQL/Redis/race/key/clock/HTTP/relay/permission/native/device checks and record actual results. Android/iOS native runtime, iOS build, relay-only same-container connectivity, media/privacy, background/OS push and independent audio capacity gates remain open. M7 is not complete.
