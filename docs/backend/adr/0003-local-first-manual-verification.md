# ADR 0003: local-first development and explicit verification

Date: 2026-11-11. Status: accepted user direction; implementation closeout, verification pending.

## Context

The user requires local implementation and builds first, tests only on explicit command, and hosting only after the whole system is implemented, tested and working. Monitoring must remain optional. This supersedes ADR 0002's automatic PR-test/main-release trigger defaults; security and test acceptance requirements remain recorded for later authorization.

## Decision

- PR CI performs installation, schema generation, static checks and compilation only. It never calls aggregate commands that execute tests.
- The CI workflow exposes a typed boolean `run_tests` input for manual/reusable invocation, defaulting to false. Unit/policy/failure probes, real-service tests, load checks and scanner jobs require explicit opt-in. PR events cannot opt into these jobs.
- Release publishing is manual only, with separate default-false test and publishing inputs and repository variable `BACKEND_RELEASES_ENABLED=true`. Both inputs and the variable are required on main. A future authorized release must still pass full verification before publishing; a build-only run cannot publish.
- Staging preparation stays dormant behind a default-false input and `BACKEND_STAGING_ENABLED=true`, restricted to main. It only prepares a bundle; no workflow deploys to a host.
- Do not enable these variables, dispatch workflows, push images, provision hosting or start optional monitoring as part of this closeout. Do not execute tests, scans or load checks until the user commands them.
- The ordinary local service set remains API, worker, PostgreSQL and separate queue/cache Redis. Monitoring and verification containers remain opt-in. No new package, image or service is introduced.

M1 can be reported as **implementation complete; verification pending** under this revised delivery sequence. It is not verified complete or production-ready. M2 implementation can proceed when requested; all verification/release gates remain outstanding until their evidence exists.

## Documentation and compatibility evidence

Reviewed GitHub's current [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) and [event/input semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) before changing triggers. Boolean inputs use the typed `inputs` context; absent repository variables do not satisfy the explicit string comparison. Existing pinned actions, Node/Nest/Prisma versions and lockfile remain unchanged.

## Validation limits

Only static document/configuration review and build/compilation are authorized in this closeout. Do not run fixture tests, actionlint/Prometheus behavior tests, Docker service suites, security scanners, load generators or remote workflows. Record the actual allowed checks and any failures in `M1_VERIFICATION.md`; historical results do not verify these new trigger changes.
