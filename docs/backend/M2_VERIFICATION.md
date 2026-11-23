# M2 implementation and verification record

Updated 2026-11-12. Backend source implementation is present; **verification and mobile integration are pending**. This is not a production-security, provider-delivery or capacity claim. The user's no-tests/local-first instruction remains in effect.

## Implemented

Identity/accounts modules, strict schemas and API contracts; signup/password/OTP/reset flows; current-state session authorization; opaque refresh rotation/reuse revocation; TOTP/enrollment/recovery; profile/preferences/owned saved places; deletion request; shared Redis quotas; opaque cross-module transactions; minimal append-only audit; separate runtime/migration environment templates and local key/code helpers. Eight new tables plus the existing platform marker are defined. See [M2 design/setup](M2_IDENTITY_ACCOUNTS.md) and [ADR 0004](adr/0004-m2-identity-and-account-security.md).

Selected dependencies: jose 6.2.17, zod 4.6.7, otplib 13.6.0; eleven packages added with install scripts/audit disabled. Node/Nest/Prisma/TypeScript versions remain unchanged. `npm ls` reports the selected versions and otplib's nested noble/hashes 2.4.0 (Node >=20.19), compatible with Node 24.18. Engine-strict install used no force/legacy-peer overrides. No vulnerability scan has been run for the changed tree.

## Allowed build/static work

Prisma client generation and SQL generation from two schema files ran without contacting a database. `npm run build` (including generated OpenAPI/events), `npm run typecheck`, `npm run lint`, `npm run check:boundaries` and `npm run check:workflows` passed on 2026-11-12. Formatting was applied. Typechecking includes test source, but does not execute it. Static review corrected framework types, INSERT-only audit behavior, resend quota distinctions, safe datastore errors and pre-authentication ingress quotas. Compilation is not runtime verification.

Local key generation: completed; three separate keys are configured in ignored `.env`, with no values printed. Owner configuration is separate in ignored `.env.migrate`. The target was identified from its URL (loopback 55432, `zipp_dev`, `zipp_owner`), running Compose container and `current_database()/current_user` before mutation. `npm run prisma:migrate:deploy` successfully applied `20261111000000_identity_accounts` on 2026-11-12. No reset, seed or test-database mutation was performed. This establishes development schema application, not verified constraints/authentication behavior. API/worker startup and Docker rebuild were not performed for M2. No hosting or release workflow was activated.

## Test sources written, not executed

- Schema/ownership-field rejection, phone/password/coordinate limits and purpose-specific input formats.
- Password salting/verification, access-token claim/purpose isolation, encrypted TOTP user binding/replay and disabled/production adapter configuration.
- Recent-MFA expiry/future-time policy.
- Isolated PostgreSQL session replay/concurrent refresh/current status, owned Home/saved-place behavior and append-only audit permissions. These fixtures require `zipp_test` and retain only their own isolated rows; cleanup deactivates/revokes fixtures without deleting users/audit.
- Existing health/integration test sources were updated for current framework types and the M2 schema marker. No suite, fixture, negative probe or test runner was executed.

## Remaining acceptance work (only on command)

1. Apply/repeat migration on an identified isolated test database, verify SQL grants/constraints and full M2 startup. Verify development migration state separately; do not reset either database.
2. Execute existing/new unit, real-service and HTTP/E2E suites. Add complete HTTP flows for registration/resend/replay/exhaustion/expiry, reset without MFA removal, role/purpose isolation, refresh races, revocation, enrollment, recovery, account deletion and foreign ownership. Current written tests alone are not full M2 acceptance coverage.
3. Add/exercise multi-instance Redis quota/shared-window, cache outage/fail-closed, unknown-account/timing/provider-failure enumeration, scrypt admission and recovery scenarios. Verify 429/Retry-After, 503, malformed/oversized bodies and forwarded-header handling.
4. Verify security-critical branch coverage >=90% and overall >=80%; no M1 coverage percentage applies to this new code. Review dependency/image scans and new transitive packages on command.
5. Verify key lifecycle, recovery/retention and secret-free logs/artifacts; migrate to a real provider only in its milestone. Production auth currently rejects local delivery by design.
6. Integrate mobile identity, native secure token storage and saved places after the contracts pass authorized verification; perform native/platform checks when authorized. No mobile integration is claimed yet.

The event envelope is a reserved versioned contract, not an enabled outbox/event publisher. No real SMS, payments, cloud resource or 1,000-user benchmark has been performed. M2 cannot be called verified complete while these gates remain open.
