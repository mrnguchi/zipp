# M1 dependency review

Reviewed 2026-11-09. Owner: backend maintainers. Recheck by 2026-12-09 or on any lockfile change. This is a follow-up record, not a high/critical gate exception. All high/critical findings continue to block CI and releases.

The local npm report contains 20 affected dependency-tree entries (three low, 17 moderate), derived from three underlying advisories. The affected paths are the Jest/ESLint/typescript-eslint development toolchains. Runtime vulnerability results require the separate production-image scan. Do not describe the dependency tree as vulnerability-free.

| Advisory | Reported issue | Scope and next action |
| --- | --- | --- |
| [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | deepmerge prototype poisoning, low | Jest configuration/development path; keep untrusted configuration isolated and evaluate a supported upstream fix. |
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | glob cancellation bypass, moderate | Test discovery/development path; jobs have explicit outer time limits. Recheck patched compatible tool releases. |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | minimatch amplification denial of service, moderate | Lint/test discovery paths; run untrusted PRs without write permissions or deployment secrets, with job limits. Evaluate maintained compatible fixes. |

These controls limit exposure; they do not prove the vulnerable functions are unreachable or resolve the advisories. npm currently proposes incompatible major changes/downgrades for the parent tooling. Do not run audit fix with force, introduce blanket overrides, or suppress reports. Upgrade through the documentation/compatibility policy and rerun the affected gates. The migration image currently includes development dependencies for the Prisma CLI; it must also pass the independent image severity gate and its exposure must be reviewed when activated on a host.
