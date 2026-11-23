# Development resources and version policy

Reviewed 2026-11-06 for the new backend. Old installed backend versions do not constrain the fresh implementation.

M0 was verified on 2026-11-08. The implemented versions, pinned image digests, primary references and native compatibility decisions are recorded in [ADR 0001](adr/0001-m0-foundation.md); actual checks and audit qualifications are in [M0 verification](M0_VERIFICATION.md). The selection workflow below remains mandatory for subsequent changes.

Mandatory workflow: [dependency policy](DEPENDENCY_POLICY.md). Feature reference: [live tracking and calls](LIVE_TRACKING_AND_CALLS.md). Read current official/version-specific documentation before implementing changeable integrations and before package installs/upgrades; record compatibility and build evidence.

M7.2 compatibility note (2026-11-20): [ADR 0012](adr/0012-m7-chat-and-support-tickets.md) records reuse of the installed Prisma 7.10.1/Nest 12.3.3 stack without installation. Current Prisma transaction/pagination URLs redirect to newer `db.transaction`/`db.orm` examples; do not copy those into this pinned `$transaction`/generated-client project. Use version-matched installed source/types and the recorded fallback when current web examples target a different major. This is not authorization to upgrade.

M7.3 (2026-11-20): [ADR 0013](adr/0013-m7-notification-devices-and-durable-delivery.md) records Node 24.18 crypto/filesystem and installed BullMQ 5.76.4 API evidence for local notification encryption/capture and bounded queues. The public BullMQ v5 worker URL now redirects to a v6-labelled reference; retain the verified installed v5 contracts and existing queue pattern, not new-major examples. No install/upgrade/provider SDK was required. [Notification runbook](M7_NOTIFICATIONS.md) separates local capture from future provider/native acceptance.

M7.4 (2026-11-21): [ADR 0014](adr/0014-m7-call-control-and-ephemeral-signaling.md) records current official WebRTC recommendation, Redis Lua, PostgreSQL 18 locks and exact Node 24.18 crypto references, reused installed Prisma/ioredis contracts and no new packages. [Calling guide](M7_CALLING.md) distinguishes local metadata/encrypted ephemeral signaling from unselected media provider/relay privacy/native SDK and OS incoming-call work. Manifest inspection alone (Expo ~58.0.19/RN 0.88.0/React 19.3.0) is not a native calling compatibility spike or device evidence.

## Bootstrap compatibility decision

At M0, select a supported Node LTS and stable compatible NestJS, TypeScript, Prisma/client/driver, PostgreSQL, Redis, BullMQ and test versions together. Record exact versions, runtime/module format, native build/runtime dependencies and image digests in an ADR and lockfiles. Verify clean install, generation, migration, container build/start and tests before accepting the matrix.

Never use a prerelease or floating latest image by default. Current docs may target a different major; Prisma pool/config and Nest module/adapter APIs must match the chosen versions. Dependency update automation proposes changes through CI; a major upgrade is explicit work with contract/migration/load tests.

## Primary references

| Reference | Application |
| --- | --- |
| [NestJS](https://docs.nestjs.com/) | Modules, dependency injection, transport/application composition |
| [Nest configuration](https://docs.nestjs.com/techniques/configuration) | Startup validation and typed configuration |
| [Nest validation](https://docs.nestjs.com/techniques/validation) | Runtime input boundaries |
| [Nest authorization](https://docs.nestjs.com/security/authorization) | Guards/policies alongside domain ownership |
| [Nest rate limiting](https://docs.nestjs.com/security/rate-limiting) | Throttler and a verified shared-storage adapter |
| [Nest testing](https://docs.nestjs.com/fundamentals/testing) | DI-aware tests and HTTP E2E |
| [Nest OpenAPI](https://docs.nestjs.com/openapi/introduction) | Generated and checked API contracts |
| [Nest queues](https://docs.nestjs.com/techniques/queues) | BullMQ integration compatible with selected version |
| [Prisma](https://www.prisma.io/docs/) | Pinned-version schema, generated client, driver and migrations |
| [Prisma connection pool](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool) | Per-process pool configuration; current redirect is version-specific |
| [PostgreSQL connections](https://www.postgresql.org/docs/current/runtime-config-connection.html) | Connection budget and supported-version reference |
| [Docker build guidance](https://docs.docker.com/build/building/best-practices/) | Multi-stage minimal pinned images and CI builds |
| [GitHub Actions security](https://docs.github.com/en/actions/reference/security/secure-use) | Workflow trust, permissions, secrets and action pins |
| [BullMQ production](https://docs.bullmq.io/guide/going-to-production) | Queue persistence, Redis memory policy and runtime operation |
| [BullMQ idempotency](https://docs.bullmq.io/patterns/idempotent-jobs) | Retry-safe effects |
| [Socket.IO multi-node](https://socket.io/docs/v4/using-multiple-nodes/) | Adapter, transport and sticky-routing requirements |
| [Socket.IO delivery](https://socket.io/docs/v4/delivery-guarantees/) | Explicit missed-event recovery and application acknowledgements |
| [WebRTC TURN](https://webrtc.org/getting-started/turn-server) | Direct connectivity and authenticated media relay |
| [Expo location](https://docs.expo.dev/versions/latest/sdk/location/) | Version-matched permissions, background location and OS limitations |
| [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) | Native dependency/configuration builds and platform testing |
| [Apple VoIP notifications](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit) | Verify current incoming-call/OS reporting obligations before native integration |
| [Android calling](https://developer.android.com/develop/connectivity/telecom/voip-app) | Native Telecom/audio/incoming-call integration |
| [npm package metadata](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) | Engine and peer constraints; check actual selected npm/package version |
| [k6 thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/) | Reproducible performance failure gates |

These links explain implementation mechanics; Zipp policy, quotas, topology and budgets are the explicit decisions in this pack. Read the provider's own country/product-specific docs when integrating money/SMS rather than inheriting assumptions from example code.

## Tools to establish

- Node/npm, local Nest CLI, TypeScript strict, ESLint/formatter and checked module boundaries.
- Docker Engine/Desktop with Compose; test runner containers using isolated Postgres and both Redis roles.
- Prisma ORM/client with reviewed committed migrations; exact XAF types and database constraints.
- Jest/Nest testing, Supertest, Socket.IO client, deterministic fixtures/clocks and property tests for money.
- k6 scripts/report artifacts; OpenTelemetry, structured logging and metrics/dashboard stack.
- GitHub Actions/OCI registry default, image/secret/dependency scanners, SBOM/provenance tooling, environment/IaC manifests for the selected host.
- Mock payment/payout/SMS/push/routing adapters and private S3-compatible local storage.

Exact scanner/observability/storage products are selected in M0-M1 for compatibility and maintenance; listing them here is not proof they are configured.

## Access and environment requirements

| Resource | Development/test | Staging/production requirement |
| --- | --- | --- |
| Git/CI/registry | Local working tree + repeatable commands | Repository permissions, protected branches/environments, registry and short-lived deployment credentials |
| Container host/network | Local Compose | Replica support, load balancer/TLS/domain, private networking, resource budgets and failure domains |
| PostgreSQL | Fresh isolated dev/test containers | Durable storage, connection/HA budget, encrypted backups/PITR, tested restore and restricted roles |
| Redis queue/cache | Separate containers and memory policies | Private auth/TLS, queue persistence/noeviction, memory/connection monitoring and recovery |
| Storage | Private local emulator/test objects | Private bucket, size/type/access controls, signed URL and retention policy |
| SMS/push | Capture adapters and dummy devices | Approved provider accounts, credentials, spending quotas and physical-device tests |
| Payments | Explicit deterministic mocks | Product/country eligibility, sandbox credentials, actual webhook/status/payout contract and reconciliation |
| Routing | Fixtures + adapter | Provider limits/licensing, server route access, timeout and service-area policy |
| Observability | Optional Compose profile | Restricted dashboards, alerts, trace/log redaction, retention and on-call ownership |

No paid provisioning, real-money operations or production deployment is performed solely to establish these rules. Choose actual services when implementation needs them; independent local work continues meanwhile.

## M7.5/foreground mobile and self-hosted direction (2026-11-23)

No dependency/image/SDK installed or upgraded. Reused installed Node 24.18.0, Nest 12.3.3, Prisma 7.10.1, Zod 4.6.7 and actual mobile Expo 58.0.19/RN 0.88.0/React 19.3.0/Crypto 58.0.8/SecureStore 58.0.3. Reviewed [PostgreSQL 18 locks](https://www.postgresql.org/docs/18/explicit-locking.html), [constraint triggers](https://www.postgresql.org/docs/18/sql-createtrigger.html), [Expo 58 Crypto](https://docs.expo.dev/versions/v58.0.0/sdk/crypto/), [React effects](https://react.dev/reference/react/useEffect), [RN keyboard behavior](https://reactnative.dev/docs/keyboardavoidingview). See [ADR 0015](adr/0015-m7-staff-operations.md) and [mobile guide](M7_MOBILE_COMMUNICATIONS.md). Self-hosted choice/candidate SDK and coturn sources are recorded in [ADR 0016](adr/0016-m7-self-hosted-calling-direction.md); moving-branch source/workspace catalog peers do not establish published or native compatibility. No candidate SDK installation or media claim. Tests remain unrun.

## M8 Smobilpay/SMS documentation review (2026-11-23)

[Provider plan](M8_PROVIDERS.md) and [ADR 0017](adr/0017-m8-smobilpay-provider-selection.md) record official links, older-versus-linked API contract differences, sandbox onboarding and the SMS shortlist. User selected Smobilpay but has no sandbox account. No SDK, image or dependency installed; no compatibility/runtime/provider/test claim. Confirm assigned version/authentication/entitlements before implementation.
