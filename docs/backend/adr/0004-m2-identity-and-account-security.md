# ADR 0004: M2 identity and account security

Date: 2026-11-11. Status: backend implementation present; verification and mobile integration remain pending on command. Local development schema applied 2026-11-12; see [M2 evidence](../M2_VERIFICATION.md).

Implementation continuation: 2026-11-12. Runtime and migration-owner environment files are now separate. The limiter currently fails closed for all versioned API routes, including profile reads; no process-local read fallback is introduced without a measured database/ingress budget. Health diagnostics remain explicit exceptions. A conservative read-only fallback is deferred to the resilience work and must be reviewed before claiming the broader availability targets in CAPACITY.md. This chooses stricter admission, not an availability guarantee.

A shared 300/min/IP ingress ceiling precedes JWT/database work on non-health routes, including malformed/invalid credentials. The narrower anonymous, account, password and OTP quotas still apply. This local topology trusts no forwarded IP; a shared ingress/proxy requires an explicit trust/quota review before hosting.

## Decision

Keep the existing modular monolith, PostgreSQL and Redis services. Add identity and accounts feature modules with public facades, a shared opaque transaction context and database adapter, strict runtime request schemas, default authentication, current-session checks and shared Redis quotas. Do not add a new service or import legacy implementation.

Select `jose` 6.2.17 for fixed-HS256 access JWTs, `zod` 4.6.7 for strict DTOs and JSON Schema/OpenAPI generation, and `otplib` 13.6.0 for standard TOTP. npm metadata and official documentation were reviewed before installation: MIT licenses; no incompatible direct peers/engines declared; native ESM matches Node 24.18/TypeScript 5.9.3. Otplib uses its maintained pure-JavaScript plugins; no native crypto package is added. Verify resolved transitive requirements and actual exported types after installation. No existing framework/runtime major is upgraded and no force/legacy-peer flag is allowed.

- Phone is canonical E.164 (`+` plus 8-15 digits); names remain one display-name field. Public signup always grants CUSTOMER only. Driver selection in mobile does not grant driver or staff permissions.
- Passwords accept 12-128 characters without trimming or composition rules; use asynchronous Node scrypt N=131072,r=8,p=1 with a random salt and bounded per-process hashing concurrency. Unknown-user login pays the same derivation cost. Exact performance calibration awaits authorized testing.
- Signup and password login require a purpose-bound phone OTP before a session is issued; enabled TOTP replaces SMS as the second login step. Pending signup credentials belong to the challenge, and only the phone proof installs them, preventing pre-registration account takeover.
- OTPs use cryptographic random six-digit codes, HMAC digests bound to challenge ID/purpose, five durable attempts, five-minute expiry, bounded resend chains and atomic one-time consumption. Generic initiation responses conceal unknown/already-active accounts. Resends invalidate the previous challenge.
- Development OTP delivery is a private local file mailbox under the OS temporary directory, never an application log or public endpoint. Production rejects this adapter. Actual SMS integration belongs to M8. Authentication is explicitly disabled/fail-closed until keys are configured in local development; production cannot disable it.
- Access JWTs last 10 minutes and validate signature, algorithm, issuer, audience, type, purpose, subject/session identity and expiry. Refresh tokens are opaque random secrets stored as hashes, rotate atomically and revoke their session family on reuse. Every protected request checks current PostgreSQL session/account state. Logout and password changes revoke access immediately through that state, not a process-local denylist.
- Identity owns users, challenges, sessions, refresh credentials, TOTP and recovery credentials. Accounts owns profile/preferences and saved places. Shared transactions pass an opaque context to facades, with the Prisma client confined to infrastructure. Signup verification, profile provisioning, session creation and audit commit together. Row locks follow user -> session/challenge ordering; token-reuse revocation commits before returning an error. No delivery/network call occurs inside a database transaction.
- TOTP secrets use authenticated encryption with a separate configured key and user-bound associated data; track accepted time steps to reject replay. Recovery codes have cryptographic entropy, are hashed, shown once and consumed atomically. Password plus recent MFA protects sensitive security changes; staff/financial authorization must require current role and strong MFA.
- Shared Redis fixed-window quotas update multiple applicable counters atomically in Lua. Account/IP keys are HMAC pseudonyms, expired and bounded. Authentication and sensitive operations fail closed on Redis loss. Initially cap all password attempts at five per 15 minutes/account (stricter than the failed-only budget), plus 30/IP, to admit bounded expensive work before hashing. Tune only after authorized evidence. Default general limits are 60/min/IP anonymous and 120/min/account with 30/10s burst authenticated; OTP send has 1/min + 5/hour/account and 20/hour/IP.
- Trust no forwarded headers in the current local topology. A future hosting adapter must configure and verify explicit proxy trust before deployment. Bound request bodies, pagination and saved-place counts. Enforce ownership in persistence filters as well as authenticated transport.
- Account deletion is a persisted request/status transition with session revocation, not physical deletion or removal of future financial records. Saved places support one Home, one Work and bounded Other entries; coordinates and fields are validated server-side.

## Local setup and delivery sequence

Document API/error/event contracts and mobile-field mapping before integration. Provide an explicit local key-setup helper; never hardcode usable production keys or give migration-owner credentials to API/worker containers. Prepare additive reviewed migrations and separate app grants. Do not reset data. Only apply a migration to a positively identified development database if that execution is performed and recorded.

Write security/concurrency/ownership tests without executing them. Build/generate/static review is allowed under ADR 0003; no tests, scans, load generation, hosting or live provider operations are authorized. Do not claim tested security, integrated mobile identity or capacity. Mobile networking and secure token storage wait until the backend contracts pass authorized verification.

## Primary references reviewed

- [Node 24.18 crypto](https://nodejs.org/download/release/v24.18.0/docs/api/crypto.html), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- [jose](https://github.com/panva/jose), [Zod 4](https://zod.dev/v4), [JSON Schema conversion](https://zod.dev/json-schema).
- [otplib getting started](https://otplib.yeojz.dev/guide/getting-started), [security guidance](https://otplib.yeojz.dev/guide/security).
- [Nest guards](https://docs.nestjs.com/guards), [Prisma 7 transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions), [Redis atomic Lua execution](https://redis.io/docs/latest/develop/programmability/eval-intro/).
- [Prisma 7 error codes](https://www.prisma.io/docs/orm/v7/reference/error-reference), reviewed 2026-11-12 for safe 503/409/404 mapping without exporting database messages or metadata.
