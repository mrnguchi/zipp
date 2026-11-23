# Documentation-first implementation and compatible dependencies

Established 2026-11-06. Mandatory for new/changed backend, mobile and infrastructure features in this workspace, including installs, upgrades, native plugins, provider SDKs, images and CI actions. This is a development requirement, not a new permission or approval flow.

## Read before implementing

1. Read the relevant project architecture, engineering standards, feature reference and current code/configuration.
2. Inspect package.json, lockfile, installed/resolved versions where available, runtime/module format, image/runtime versions and target platform constraints. A declared semver range is not the installed version.
3. Before implementing behavior that depends on changeable APIs, framework/OS restrictions, providers or security settings, consult current official primary documentation and the version-specific reference/release notes for the actual selected versions. Do this before writing the integration or installing the package, not after a build fails.
4. Prefer official framework/provider docs, official package repositories/releases and published package manifests. Blogs/answers can help discover a topic but do not establish compatibility or replace primary API/security guidance.
5. Record URLs, reviewed date, relevant version, assumptions and compatibility evidence in the feature's ADR or dependency record. Existing verified notes may be reused when versions/behavior are unchanged; reverify on upgrades, changed constraints or new uncertainty. A `latest` link alone is not version evidence.
6. If current documentation is unavailable, record the gap and use verified version-matched source/types/tests where sufficient. Do not invent compatibility, suppress install errors or ship an unverified native/security/payment integration. Continue independent work that does not depend on the unresolved choice.

## Package selection gate

Install only a needed maintained package with a clear responsibility. First check whether existing runtime/framework capabilities already meet the requirement. Evaluate license, provenance, maintenance/security history, transitive footprint, operational cost and replacement risk.

| Compatibility boundary | Required evidence |
| --- | --- |
| Node/npm/module format | Supported engine ranges, ESM/CommonJS behavior, TS/build tooling and reproducible lockfile |
| Nest ecosystem | Core/common/platform/testing/adapters and official integrations have supported compatible peers |
| Prisma/database | CLI/client versions agree; driver adapter/connection config matches the selected major; target PostgreSQL/image/native runtime works |
| Redis/BullMQ/socket stack | Redis version/client/queue/adapter APIs and required persistence/transport features match |
| Expo/React Native | Actual Expo SDK/React Native/React peers, native architecture support, config plugin, Android/iOS minimums and native toolchain verified |
| WebRTC/native calling | Maintained SDK/adapter supports selected Expo/RN and target OS; permissions, push, audio routing and native build demonstrated |
| Containers/CI | Image architecture/libc/native binaries, production dependencies, action versions/pins and runner compatibility verified |

Read `engines`, `peerDependencies`, optional/native requirements and migration notes, not only package names. A successful npm resolution is necessary but does not prove runtime or native compatibility. npm's package metadata documents these constraints. [npm package.json reference](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)

Do not use `--force`, `--legacy-peer-deps`, broad overrides or blanket exclusions to hide incompatible versions. Fix the version choice or choose a supported alternative. A narrowly scoped override for a verified transitive fix requires documented justification, source evidence, security impact and regression tests; it cannot substitute for native/framework compatibility.

For mobile, use the actual Expo SDK guidance and `expo install` where appropriate, then version validation/Expo Doctor and native tests. These tools help detect issues but do not certify an arbitrary third-party WebRTC/calling SDK. Check config/plugin/native requirements explicitly. [Expo CLI](https://docs.expo.dev/more/expo-cli/), [Expo SDK references](https://docs.expo.dev/versions/latest/)

## Installation and verification workflow

- Choose versions together for the affected compatibility matrix; do not independently install every newest major. Preserve existing mobile compatibility while selecting a fresh backend baseline.
- Use the project's package manager/lockfile. Install in the relevant project only, avoid unrelated lockfile churn, record exact resolved versions and commit manifest + lockfile together. Pin runtime/images/actions according to infrastructure policy.
- Review package lifecycle/native build steps and privilege/network implications. Never expose secrets to an untrusted dependency/build step.
- Verify dependency tree/peers, clean frozen install, strict typecheck, affected tests, production build and container runtime. Native packages require the supported Android/iOS build and target-device smoke tests; TypeScript passing is insufficient.
- Run appropriate security/license checks, verify production artifacts include required generated/native files, and exercise failure/reconnect/provider boundaries relevant to the package.
- Document migration/config/env changes, feature flags, rollback limits and actual results. If a check cannot run, state why and leave the affected acceptance gate pending.
- Native configuration changes require a new binary; do not claim an OTA JavaScript update installs native libraries. Preserve custom native changes when following generation/rebuild instructions.
- Update automation proposes dependency changes through the same checks. Major changes get their own ADR and migration plan; do not combine an unrelated major upgrade with feature work.

## Required evidence record

Use this template in `docs/backend/adr/` or the feature's documented evidence location. It applies to mobile packages too; place mobile-only records with the relevant mobile documentation if available and link them from shared decisions.

```text
Feature / owner / date:
Package(s), image(s) or SDK(s) and purpose:
Current -> selected resolved versions:
Runtime, framework, OS, architecture and peer requirements:
Official versioned documentation / release-note URLs:
Compatibility decision and alternatives:
Native build / permissions / provider / environment changes:
Security, license and operational impact:
Install/tree, clean install, typecheck, tests, build/container/device results:
Remaining unverified gates and limitations:
Rollback or replacement plan:
```

No evidence record is fabricated for an uninstalled package. Missing access/platforms can be documented as pending without blocking unrelated implementation. These rules require research and verification, not repeated user confirmation for routine compatible development work.
