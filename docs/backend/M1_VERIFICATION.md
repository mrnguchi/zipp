# M1 verification status

Status reviewed 2026-11-11. **Implementation complete; verification pending on the user's explicit command.** This is not verified milestone completion or a deployment. Historical execution evidence below is from 2026-11-09. Hosting is intentionally deferred until the whole system is implemented, tested and working, followed by explicit deployment authorization. See [delivery runbook](DELIVERY_RUNBOOK.md), [ADR 0002](adr/0002-m1-delivery-and-telemetry.md) and the superseding execution policy in [ADR 0003](adr/0003-local-first-manual-verification.md).

## Implementation closeout, 2026-11-11

- PR CI now uses separate static/build commands and does not execute tests. Unit/policy/probe, scanner, real-service and k6 jobs require typed `run_tests=true`; PR events cannot enable them.
- Publishing no longer triggers on pushes. It requires main, explicit test and publication inputs, and `BACKEND_RELEASES_ENABLED=true`. Staging preparation requires its own input and `BACKEND_STAGING_ENABLED=true` on main. Both remain dormant by default; no settings or remote state were changed.
- Normal local containers stay separate from optional monitoring, test runners and one-off tools. No package or image was installed/upgraded and no new service was introduced.
- `npm run build` passed on 2026-11-11 (TypeScript compilation only). `node backend/scripts/check-workflows.mjs` passed static YAML/trust-policy review after the trigger edits; it does not execute fixture tests or workflow jobs. These results do not prove GitHub execution or runtime behavior.
- No tests, scans, load checks, service startups, migrations, registry publishing or deployments were performed for this closeout. Historical image identities below predate this workflow/documentation closeout; no new Docker build was run.

## Checks completed locally

- `npm run check`: Prisma validation/generation, strict types, lint, format, module/workflow policy checks, eight policy fixtures, 26 unit tests, four HTTP E2E tests and production build passed before the final release-workflow edits.
- `npm run security:audit`: zero high/critical findings; three low and 17 moderate findings remain in the local report. These findings have not been cleared or accepted as permanent exceptions.
- Pinned actionlint passed the initial workflow files. Gitleaks found no secrets; the synthetic-secret rejection fixture passed. Secret output was redacted.
- After the release-workflow edits, formatting, module boundaries and workflow trust policy passed. The repeated policy test process then failed with a JavaScript heap allocation error during concurrent container builds. This rerun is not counted as passed.

## Additional checks completed on 2026-11-09

- Subsequent source checks passed strict types, lint, formatting, module/workflow policy checks, eight policy fixtures, 43 unit tests and four HTTP tests. The added real local OTLP-export/shutdown test then brought unit tests to 44; a combined native-coverage run passed all 48 unit/HTTP tests.
- Source-mapped V8 coverage reported 92.19% branches and 73.64% lines, with the 80% branch gate enforced. This excludes real-service tests and does not measure execution in separate API/worker containers. An earlier unmapped coverage report failed and a stale compiled file was removed; neither failed run is counted as a pass.
- Deliberately broken TypeScript and a failing test were rejected by their checks. Secret rejection and current-source scanning passed; workflow lint passed before the final monitoring-check workflow addition.
- Prometheus configuration validation and simulated behavior tests for all five alerts passed, including through the new monitoring-check helper. Live Prometheus scraping, Grafana provisioning and collector receipt remain unverified.
- Runtime, migration and final test Docker targets built successfully. Local runtime manifest-list digest: `sha256:c0587da462d236f936d7b370f1e3232963e2874b1a39d3e94c3574d922b09730`; migration: `sha256:284413a931794917cf8a76021add92dd7def2b3840e645cd57794fb75701da3c`; final test: `sha256:8e30e3f9d7575cd804dd49c510c2876997d068130cc60f465a197c2da116fd84`. These are local build identities, not published GHCR releases.
- The service-test helper initially used an unsupported Compose `run --no-build` flag. It was removed after checking the installed CLI. The corrected container-test command was not executed: automatic approval review failed because its usage limit had been reached. This was a review availability failure, not a finding that the command was unsafe. No bypass was attempted.
- Zipp's development API and worker were temporarily stopped for memory headroom. Restoration was not executed before the approval-review failure; their current running state needs checking. Unrelated projects were untouched.

## Remaining gates

Historical container builds are verified, but M1 real-service execution is still unverified. M0's earlier 32-test/container evidence remains historical, not evidence for the changed M1 source. Only when the user commands verification, run the remaining checks sequentially with adequate resources and working approval review.

Pending locally: final static/workflow checks after the last helper edits; all-service tests against the built API/worker/PostgreSQL/Redis containers; repeat and deliberately failed migration checks; runtime and migration Trivy reports/SBOMs; live private metric scraping, provisioned dashboard and collector-export checks; baseline/burst load reports; and checking/restoring the development API/worker. Do not infer these results from written scripts or downloaded images.

Pending external activation: actual GitHub CI and release runs, registry SBOM/provenance verification, branch/environment protections, and a selected host with credentials for staging promotion, smoke checks and compatible rollback. Local work can proceed while hosting remains undecided.

No GitHub workflow has been run remotely, no release has been published, no repository protection settings have been changed, and no cloud service or staging host has been provisioned. The user defers the verification commands and all hosting activation. M1 implementation is closed under ADR 0003; the verification gates above remain open and must not be described as passed or production-ready. M2 implementation may proceed when requested without silently waiving these gates.
