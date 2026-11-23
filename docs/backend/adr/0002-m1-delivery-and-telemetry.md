# ADR 0002: M1 delivery gates and private telemetry

Date: 2026-11-08. Status: implemented baseline; verification pending. [ADR 0003](0003-local-first-manual-verification.md) supersedes the automatic execution/activation defaults below. External activation is not assumed.

## Decision

Keep the M0 Nest/Prisma/Node baseline. Use the supported Prometheus successor `@prometheus-io/client` 0.16.1 and compatible OpenTelemetry API 1.10.0, SDK trace/resources/context 3.1.0 and OTLP HTTP exporter 0.301.0. Deprecated prom-client and Node/base trace SDK names are not retained. Verify the new SDK's actual exported types (including its single-object BatchSpanProcessor constructor), not older documentation examples. Align pg and its types at 8.23.1 to expose pool metrics through Prisma's supported external-pool interface without casts. YAML 2.9.1 is development-only. No force flags or dependency overrides.

Use explicit low-cardinality HTTP, dependency and worker instrumentation. Do not install automatic request/database instrumentation that could export URL queries, SQL parameters or credentials. Export OTLP only when explicitly configured; use bounded batching/sampling. Metrics/management bind to container-private ports, with no metrics route on the public API. Node/process, HTTP, dependency, database-pool, Redis and worker metrics have bounded labels. Logs carry active trace correlation without serializing raw requests.

GitHub Actions/GHCR are the pipeline defaults for the existing `mrnguchi/zipp` remote. External actions are pinned to official release commit SHAs. PR jobs have read-only tokens, no production secrets, no write-capable fork checkout patterns, bounded execution and isolated service tests. A reusable CI workflow gates release. Trusted main builds publish runtime and migration images with SBOM/provenance and commit identity; environments promote digest references, not mutable tags.

Security commands are locally executable with pinned Gitleaks/Trivy/actionlint containers. Do not suppress scanner findings broadly or auto-apply force downgrades. Any exception needs an exact finding/package/image scope, reason, owner and expiry; production high/critical findings fail otherwise. Include checks proving broken boundary/workflow/security policies are rejected.

Prepare a portable container release contract, preflight, one-shot migration, health-gated rollout and compatible-image rollback procedure. The user confirmed on 2026-11-09 that hosting is undecided; this supersedes the earlier AWS ECS/Fargate answer. The Docker-host example is an optional reference, not a host selection or provisioned environment. Do not provision resources, modify repository settings, push changes or claim deployed CD without separate evidence. Local fixtures must prove preflight rejects mutable images/missing configuration.

Initial load scripts cover the current infrastructure/health endpoints only, with configurable open arrival-rate baseline/burst and hard thresholds. They cannot establish product capacity, live media quality or the later M9 workload.

M1 verification update, 2026-11-09: service-test builds run targets sequentially to bound peak memory and avoid duplicate API/worker builds. The runtime dependency stage prunes a separate copy of the frozen install with npm 11 `prune --omit=dev --ignore-scripts`; the build/migration stages keep their original dependencies. Installation uses no audit request; the explicit audit gate remains mandatory. This follows the [npm prune reference](https://docs.npmjs.com/cli/commands/npm-prune/). Exporting an image for scanning resolves the supplied reference to a local content ID; release inputs still use immutable registry digests. Grafana file provisioning follows the [official provisioning reference](https://grafana.com/docs/grafana/latest/administration/provisioning/). No runtime/framework package version changed in this verification pass.

Coverage uses Jest 30's native V8 provider and TypeScript source maps, covering current source rather than unmapped compiler-generated decorator helpers. The overall 80% branch threshold remains enforced; generated Prisma code is excluded, and application entry points/services remain included. No domain-specific 90% gate is applicable before those modules exist. See [Jest 30 configuration](https://jestjs.io/docs/30.0/configuration#coverageprovider-string). Local stale compiled output from deleted source must be removed before checks; clean CI/container builds do not copy host output. The initial unremapped coverage result and subsequent mapped report are not equivalent metrics.

## Evidence and sources

Official package manifests/engine/peer metadata reviewed 2026-11-08 before installation. Exact resolved versions are in the backend lockfile.

- [GitHub secure workflows](https://docs.github.com/en/actions/reference/security/secure-use), [Docker publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images), [Docker attestations](https://docs.docker.com/build/ci/github-actions/attestations/).
- [OpenTelemetry instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/), [Prometheus Node client](https://github.com/prometheus/client_js).
- [Gitleaks CLI](https://github.com/gitleaks/gitleaks), [Trivy image scan](https://trivy.dev/docs/latest/target/container_image/), [actionlint](https://github.com/rhysd/actionlint).
- [k6 arrival-rate executor](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/).

Record actual test, scanner, container, load, export and deployment results in the M1 verification report. Container images and actions are accepted only after their resolved identities and available local checks are recorded. No production/CI success is inferred from writing YAML.
