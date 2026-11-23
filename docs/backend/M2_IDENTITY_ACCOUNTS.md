# M2 identity, accounts and local setup

Updated 2026-11-12. Backend implementation is present; runtime/security verification and mobile integration remain pending. No tests, scans, load generators or hosted services are authorized. [ADR 0004](adr/0004-m2-identity-and-account-security.md) records the design and package research. [Evidence](M2_VERIFICATION.md) distinguishes source/build results from unverified behavior.

M3 continuation: the latest migration/readiness marker is now `m3`; follow [finance setup](M3_FINANCE.md) for current schema state. Account deletion now rejects wallets with funds, active reservations or unresolved payment operations before revoking access. No physical financial records are deleted.

## Scope and ownership

Identity owns signup, OTP challenges/resend, password login/reset/change, sessions, refresh rotation/reuse revocation, logout, TOTP/recovery codes and account-deletion requests. Accounts owns display name/preferences and saved places. Public signup grants CUSTOMER only. Choosing driver mode is a preference, not driver approval or an authorization role. Phone changes, uploads and staff provisioning have no public shortcut in M2.

Eight new tables are defined: `users`, `account_profiles`, `auth_sessions`, `refresh_credentials`, `auth_challenges`, `recovery_codes`, `saved_places`, `security_audit`. Including `platform_metadata`, the Prisma schema has nine application tables; Prisma's migration bookkeeping is additional. The additive migration was applied to identified local `zipp_dev` on 2026-11-12. In pgAdmin, refresh `Databases > zipp_dev > Schemas > public > Tables` to see them. Other environments remain unmigrated by this step. Identity and accounts share an opaque transaction context; only infrastructure resolves it to a Prisma client.

Runtime receives SELECT/INSERT/UPDATE on the mutable feature tables, DELETE only for saved places/recovery-code replacement, and INSERT only on audit. Audit records distinguish an authenticated actor from an unauthenticated attempt's subject. They contain no password, token, OTP, TOTP secret or raw IP. Audit insertion uses `createMany` to avoid an INSERT ... RETURNING request that would require SELECT. Read/export/retention belongs to a separate operator role later.

## Local setup commands (not test commands)

From `backend/`:

```powershell
npm run auth:setup
docker compose -f ../infra/compose/compose.yaml up -d postgres
npm run prisma:migrate:deploy
npm run prisma:generate
npm run build
npm run services:up
```

Run only the steps needed for the current development task. `auth:setup` generates three separate random keys into ignored `.env`, preserving valid existing keys, and creates ignored `.env.migrate` if missing. It does not start services or query the database. If an older runtime `.env` contains `MIGRATION_DATABASE_URL`, move that line to `.env.migrate` first: owner credentials must not accompany runtime identity keys. `.env.migrate.example` supplies the local owner connection; never use that example for hosting.

Check the intended database before applying migrations. The local target is `zipp_dev` at loopback port 55432, not `zipp_test` or a remote database. No reset, db-push or automatic seed is required. The migration is additive and explicitly transactional, includes constraints/app grants, and updates the readiness marker to `m2`. The new application refuses readiness on the old `m0` marker. A previous M1 image is not a compatible rollback after this marker change without a reviewed forward plan; no automatic down migration is provided.

Compose reads runtime AUTH settings from the invoking environment/`.env`; the API receives only explicitly mapped auth keys and the application DB credential. Worker and migration containers do not receive those auth keys. When starting services from the project root, supply `--env-file backend/.env`; from `backend/`, the normal npm command finds `.env`. Migration CLI commands load `.env.migrate` separately. Keep real environment files out of version control and images.

Identity defaults to disabled/fail-closed in development until keys are configured: health infrastructure can start, but authentication does not grant access. Production cannot disable identity and cannot use the local code-delivery adapter. A real provider adapter is deliberately required before production enablement in M8.

## Development OTP delivery

The local adapter writes an expiring private mailbox under the API process's OS temporary directory, not to application logs or an HTTP endpoint. No real SMS is sent. It simulates possession of a phone only for local development; actual phone ownership is not established with a provider yet.

After an explicitly requested manual API flow returns a challenge ID, the developer can read its code on the same host/process environment:

```powershell
npm run auth:code -- <challenge-uuid>
```

For a container API, its temporary directory is inside that container:

```powershell
docker compose -f ../infra/compose/compose.yaml exec api node scripts/read-local-otp.mjs <challenge-uuid>
```

This explicit utility prints a development code only; never include its output in reports or application logs. It rejects expired mail and production mode. The mailbox disappears with the container's temporary mount. Losing a capture does not create an authentication bypass: request a new code within the allowed resend chain. Redis and PostgreSQL hold limits/state; the mailbox is delivery only. Monitoring remains off unless requested.

## API contract and flows

`backend/contracts/openapi.json` is generated from runtime request schemas by `npm run build`. CI compiles and checks the committed generated contracts for drift; it does not run tests by default. JSON/event contracts are generated artifacts; edit their source schemas/generator, not their JSON by hand. No public Swagger service or additional container is installed.

All paths below have prefix `/api/v1`. Requests use JSON and protected endpoints use `Authorization: Bearer <accessToken>`. No authentication cookies or query-string tokens are used. Responses are `no-store`. Phone is canonical E.164; password is 12-128 characters with no trimming. Signup accepts one `displayName`, never client roles/status/user IDs.

| Flow | Endpoint | Result |
| --- | --- | --- |
| Signup | POST `/auth/signup` | 202, challenge ID; no session yet |
| Verify signup | POST `/auth/signup/verify` | Token pair after atomic phone proof/profile provisioning |
| Password login | POST `/auth/login` | 202, `next=phone_code` or `two_factor` |
| Verify login SMS simulation | POST `/auth/login/verify` | Token pair |
| Resend phone code | POST `/auth/challenges/resend` | New challenge invalidates the previous one; TOTP is not resent |
| Refresh | POST `/auth/refresh` | New opaque refresh secret plus access JWT |
| Logout | POST `/auth/logout` | 204; `{allSessions:true}` also revokes all sessions/pending challenges |
| Reset | POST `/auth/password/reset`, then `/auth/password/reset/confirm` | Generic initiation; successful proof changes password and revokes sessions/challenges |
| Change password | POST `/auth/password/change` | Current password/recent MFA when enrolled; 204 and sign-in required |
| Current session | GET `/auth/session` | Current user/session/roles/MFA state |
| Enroll TOTP | POST `/auth/2fa/enroll`, then `/auth/2fa/confirm` | Private provisioning URI; confirmation returns ten recovery codes once and requires fresh sign-in |
| Login TOTP/recovery | POST `/auth/2fa/login` | Password-bound MFA challenge plus proof yields a session |
| Fresh MFA | POST `/auth/2fa/reauthenticate` | Password and new TOTP/recovery proof refresh server-side MFA time |
| Disable/rotate recovery | POST `/auth/2fa/disable`, `/auth/2fa/recovery-codes` | Password plus proof; staff cannot disable required MFA |
| Profile/preferences | GET/PATCH `/accounts/me` | Only the authenticated user's safe profile fields |
| Saved places | GET/POST `/accounts/me/saved-places`; PATCH/DELETE `.../{id}` | Owned rows, one Home/Work each, max 50, bounded UUID-cursor pagination |
| Deletion request | POST `/auth/account-deletion` | 202 persisted request/status transition, revokes sessions; does not erase financial/audit records |

Request/response details and required fields are in OpenAPI. Safe errors contain `code`, `message` and `requestId`; throttling/controlled unavailability can include Retry-After seconds. Unknown framework/database errors do not expose their original messages. JSON/form bodies are limited to 16 KiB; request/header timeouts are 10 seconds. No forwarded IP header is trusted in the current local topology. Native mobile requests do not need browser CORS; a future web client/ingress requires an explicit reviewed origin/proxy policy.

## Invariants and recovery behavior

- Only the OTP-bound signup password/name are installed during verification; creating a PENDING user does not let a pre-registration attacker choose the eventual owner's password.
- Active/unknown accounts receive the same initiation response structure. Decoy challenges follow the same resend quota path, preventing a resend-status oracle. Timing and delivery-failure enumeration behavior still needs authorized verification; a real SMS adapter must preserve this property.
- Failed challenge/MFA attempts commit their durable counters before an error response. Successful proof is consumed atomically. Resends have a ten-minute root lifetime; individual codes last at most five minutes. TOTP has accepted-step replay protection and a durable failure budget, not merely a Redis counter.
- A refresh credential belongs to a session family. Replay revokes that family in a transaction and then returns an error. Concurrent legitimate refresh requests may trigger this protection; clients must use a single refresh operation at a time. Do not add an unreviewed replay grace window.
- Access JWTs last ten minutes, but PostgreSQL account/session checks enforce current suspension/revocation. Sessions have a fixed 30-day lifetime and a maximum of five active sessions/user. Secret/role changes need verification around concurrent requests; do not use token roles as authoritative application permissions.
- Redis quotas are atomic fixed windows across instances. Account/IP values are HMAC pseudonyms; authentication fails closed when the limiter is unavailable. All non-health routes apply a shared 300/min/IP ingress ceiling before JWT/database work, including invalid credentials. Public requests also have 60/min/IP; authenticated accounts have 120/min and 30/10s burst limits. Initial password admission caps all attempts at five/15min/account plus 30/IP, with separate five/15min authenticated password rechecks; this intentionally bounds expensive scrypt work before derivation. One 128 MiB scrypt operation runs per API process; overload returns 503 rather than queuing unlimited hashes. No throughput promise is established by these settings.
- TOTP secrets use AES-256-GCM with a separate key and user-bound associated data. Recovery secrets are high-entropy, hashed, single-use and displayed once. Staff-sensitive permissions require current roles and recent enrolled MFA. Ordinary profile preferences grant no privilege.
- A code accepted during enrollment cannot be reused immediately for login; wait for the authenticator's next code. Successful MFA reauthentication or recovery-code rotation refreshes the session's verification timestamp.
- Delivery happens after database commit. A delivery failure invalidates its challenge and returns a safe error. Authentication does not persist usable codes/tokens in logs. No external realtime/outbox publisher is enabled; the versioned identity-event schema reserves a future M3/M7 integration.
- Never physically delete users/financial references as a shortcut for an account deletion request. Before financial integration, review deletion/suspension against active jobs, balances and support recovery. Expired credential/challenge retention and bounded cleanup/operational ownership must be finalized before pilot; no automatic destructive cleanup is introduced here.

## Mobile mapping and deferred integration

The current screens are local-only. Signup's `name` maps to `displayName`; phone input must include the selected country code (Cameroon example: prefix +237 to a valid nine-digit local number). Password is sent to signup/login, never route navigation parameters or persistent profile state. The phone-verification screen must carry a server challenge ID and call the purpose-specific endpoint; its six-digit development placeholder must not be accepted as proof. Login can branch to TOTP/recovery instead of the SMS simulation.

The current development password placeholder may not meet the new 12-character policy; replace it during the explicit mobile integration slice. Save tokens using a reviewed compatible native secure-store adapter, single-flight refresh and explicit revocation/error handling; do not place tokens in AsyncStorage or Expo public environment values. A native storage package has not been selected/installed and the mobile files have not been changed. Integrate only after the backend contracts pass the user's authorized verification.

Profile keeps the display name intact. Saved places retain `{id,name,kind,label,coordinate}` with lowercase kind and `{latitude,longitude}`. Replace device-local persistence with owned API calls only in that integration slice. Driver preference must never be treated as driver approval. Account deletion revokes the session: clear local credentials and present the persisted request state rather than claiming immediate erasure.
