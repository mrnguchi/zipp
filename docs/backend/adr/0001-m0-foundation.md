# ADR 0001: fresh M0 runtime, persistence and verification

Date: 2026-11-08. Status: implementation baseline; see [verification](../M0_VERIFICATION.md) for check results. Owner: Zipp backend maintainers.

## Context and decision

The new backend starts in `backend/` without importing the legacy code, schema or dependencies. Use native ESM with Node 24.18.0, Nest 12.3.3, TypeScript 5.9.3 and Prisma/client/adapter-pg 7.10.1. The Prisma `latest` tag observed during selection was an 8.0 release candidate; stable 7.10.1 was selected deliberately. Nest common/core/platform/testing share one version. TypeScript 5.9 stays within supported typescript-eslint peers; no generator/CLI is needed because TypeScript builds the small scaffold directly.

Use pg 8.16.3 with Prisma's JS driver adapter and explicit pool/timeouts. Generated Prisma TypeScript is compiled with the app and excluded from Git/lint. CLI datasource configuration uses the separate migration URL, not the application URL. The sole M0 application table is a platform readiness marker; product schema decisions remain pending.

Use Redis 8.2.3 with ioredis 5.8.2 and BullMQ 5.76.4. Two Redis containers isolate queue persistence/noeviction from cache eviction. The worker owns its BullMQ connections and bounded concurrency. An internal `foundation-probes` queue proves actual processing without inventing a product job.

Use Jest/@jest/globals 30.2.0 and Nest testing 12.3.3 on precompiled ESM; Node's experimental VM modules warning is documented. This avoids a separate TypeScript transformer/peer compatibility surface. Use ESLint 10.14.0, @eslint/js 10.0.1 and typescript-eslint 8.72.1; ESLint 9 was replaced after its install warning showed that baseline was no longer supported. Prettier 3.7.4 supplies formatting. `npm ls --depth=0` must show a valid direct dependency tree; no force/legacy-peer flags.

Pinned image sources:

- Node `24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d`.
- PostgreSQL `18.6-alpine3.23@sha256:697c180dbf244d3ce4a8f4cbc0156cde840af055c1bf8b76aebe422a4822086f`.
- Redis `8.2.3-alpine@sha256:08ad0b1d280850169a790dba1393ff7a90aef951fc19632cf4d3ce4f78e679ba`.

The Node slim image was inspected and lacks libssl. Install OpenSSL/CA certificates in the common base for Prisma's migration engine and TLS support. Runtime image contains production dependencies and compiled/generated application code; migration/test targets retain tooling. Refresh base/package pins through tested changes; an image digest does not freeze later apt repository contents, so M1 records built-image provenance and scans the final image.

## Boundaries and alternatives

- No framework major inherited from legacy. No Prisma 8 RC, old CommonJS transpiler workaround, global Nest CLI or unverified dependency override.
- Separate API/worker entry points, shared image, internal worker health port; no API worker-consumer duplication. Domain modules will be added only when they own actual behavior.
- Postgres runtime role can read the marker but cannot create schema or write migration history. Owner credentials exist only in local migration configuration. Fixed local dummy passwords and roles are explicitly not production secrets.
- Optional storage/telemetry profiles are deferred until the M4/M1 adapters exist. No business schema, authentication, financial operations or scale claim is introduced in M0.
- M0 uses local Compose, not an HA production platform. M1 introduces CI/CD and production scan/release gates.

## Primary documentation and package evidence

Reviewed 2026-11-06 through 2026-11-08. Exact manifests/engine/peer requirements were inspected through npm metadata and the installed dependency tree; the committed lockfile records resolved dependencies.

- [Nest lifecycle](https://docs.nestjs.com/fundamentals/lifecycle-events) and [Nest testing](https://docs.nestjs.com/fundamentals/testing).
- [Prisma v7 configuration](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference), [generator](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators) and [pool](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool).
- [BullMQ connection requirements](https://docs.bullmq.io/guide/connections).
- [Jest ESM](https://jestjs.io/docs/ecmascript-modules); use the installed 30.2 API, not unverified future examples.
- [ESLint 10 migration](https://eslint.org/docs/latest/use/migrate-to-10.0.0) and [typescript-eslint compatibility](https://typescript-eslint.io/users/dependency-versions/).
- [Docker startup health ordering](https://docs.docker.com/compose/how-tos/startup-order/) and [build cache](https://docs.docker.com/build/cache/optimize/).

## Security and remaining work

Runtime dependency audit reported zero vulnerabilities on 2026-11-08. The complete toolchain audit reported low/moderate transitive development findings, including glob/minimatch/deepmerge paths. No high/critical findings were reported. Do not use the suggested force downgrade or broad overrides to hide them. Track remediation/upstream compatibility in M1 before release and scan again as advisories change; production runtime excludes development dependencies, but migration/test images still need their own supply-chain review.

Rollback is source/image rollback within this fresh foundation; do not delete data volumes or rewrite applied migrations. Follow the dependency policy and relevant tests before changing any pin. Actual container, migration, tests and shutdown evidence belongs in the verification record, not assumed from this ADR.
