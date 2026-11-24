# Zipp workspace index

2026-11-24 M7 voice step 3: [API-only temporary relay credentials](docs/backend/M7_RELAY_CREDENTIALS.md) and [ADR 0020](docs/backend/adr/0020-m7-scoped-relay-credentials.md) add scoped authorized diagnostic setup grants, private key-file loading, a separate API secret-mount override and unrun test source. Build/static checks passed; no real issuance, key preparation, DB/native/relay operation or tests. Current source 61 tables/139 REST operations, same four unapplied M7 migrations. User-ended healthy conversations/no fixed duration are required; ongoing media/renewal/reconnect comes next.

2026-11-24 M7 voice step 2: [local coturn configuration/runbook](docs/backend/M7_TURN_RELAY.md) and [ADR 0019](docs/backend/adr/0019-m7-local-turn-relay.md) add one separately opt-in relay definition, pinned image metadata and private preparation source. Compose/syntax checks passed; tests unrun, no image pull/private output/container startup or actual audio. Ordinary backend services, 61 source tables/138 REST operations and four unapplied M7 migrations are unchanged. Next: authorized temporary credentials, then ongoing foreground media/reconnection; M7 remains incomplete.

2026-11-23 foreground voice continuation: M7 native foundation adds pinned WebRTC/dev-client dependencies, a focused opt-in Expo plugin and local Android preparation/build helpers; ARM64 debug APK assembly/static inspection passed. Read [native voice guide](docs/backend/M7_NATIVE_VOICE.md) and [ADR 0018](docs/backend/adr/0018-m7-foreground-native-voice-foundation.md) for actual build evidence and remaining relay/audio/reconnection work. No actual calls, tests, migrations, push or hosting. Earlier dated entries describe their own slices; M8 planning authorization is preserved.

2026-11-23 M8 planning: user selected Smobilpay payments and authorized starting M8, superseding the earlier hold while M7 stays incomplete. Sandbox account does not yet exist; SMS shortlisted, not selected. [Provider steps/onboarding](docs/backend/M8_PROVIDERS.md), [decision](docs/backend/adr/0017-m8-smobilpay-provider-selection.md). No package/schema/runtime/provider/test changes in this planning slice.

2026-11-23 M7 continuation: staff review cases/role-separated summaries/account guards/page report and foreground mobile chat/support/generic inbox source added. Current source 61 application tables, 138 REST operations, four unapplied M7 migrations. Self-hosted WebRTC/TURN chosen; real push/audio/native implementation and all runtime gates remain pending. Local database/Docker engine unavailable; no tests/migrations ran. M8 remains on hold. See [completion checklist](docs/backend/M7_COMPLETION_CHECKLIST.md), [operations](docs/backend/M7_OPERATIONS.md), [mobile communication](docs/backend/M7_MOBILE_COMMUNICATIONS.md) and [evidence](docs/backend/M7_VERIFICATION.md).

2026-11-21 M7.4 continuation: local call control, first-device answer, account reservations, encrypted ephemeral signaling and default-off metadata reaper are present in source. No audio/provider/TURN/native ringing/CONNECTED endpoint. Four-table third M7 migration is unapplied; source now defines 58 application tables, REST contracts 129 operations. Last identified local applied evidence remains 45/base `m6`. Tests are written but unrun. Media/native calling and broader staff operations remain pending. See [calling guide](docs/backend/M7_CALLING.md) and [M7 evidence](docs/backend/M7_VERIFICATION.md). Earlier entries describe their own historical slice.

2026-11-20 M7.3 continuation: device ownership, encrypted LOCAL dummy endpoints, generic activity inbox, atomic communication intents and default-disabled execution/capture in the existing worker are implemented in source. Four-table migration adds optional `notifications=m7_3` marker; source now has 54 application tables. Both M7 migrations are unapplied here; last identified local evidence remains 45/base `m6`. Tests are written but unrun. No packages, provider calls or new container/service. Native/provider notification integration, calling and broader operations remain pending. See [notification guide](docs/backend/M7_NOTIFICATIONS.md) and [M7 evidence](docs/backend/M7_VERIFICATION.md). Older entries below describe their historical slice.

2026-11-20 M7.2 continuation: backend participant chat/support tickets and nine REST operations are implemented behind `COMMUNICATIONS_ENABLED=false`; five-table migration source brings defined application tables to 50. Migration not applied here; last identified local evidence remains 45/base `m6`, with separate `communications=m7_2` required on enablement. Tests are written but unrun; mobile chat, push, calling and broader operations remain pending. See [chat/support](docs/backend/M7_CHAT_SUPPORT.md) and [M7 evidence](docs/backend/M7_VERIFICATION.md). Earlier dated entries describe their own slice/historical state.

2026-11-20 M7 is in progress: first private participant live-stream source, shared admission and opt-in mobile delivery client are implemented; tests are written but unrun. No tables/services/marker change. Chat, push, calling/media/native and operations remain future M7 slices. See [guide](docs/backend/M7_REALTIME.md) and [actual evidence](docs/backend/M7_VERIFICATION.md).

2026-11-14 current M6 status: backend and opt-in mobile API integration source are present; both M6 migrations are applied to identified local `zipp_dev` (45 application tables, marker `m6`). Tracking registration returns metadata only, and shared-job fixtures/missing test source are addressed. Tests and device/native execution remain pending on command. See [current evidence](docs/backend/M6_VERIFICATION.md) and [mobile setup/recovery](docs/backend/M6_MOBILE_INTEGRATION.md). Earlier dated notes below are historical; M7-M9 remain implementation work.

Indexed from local source on 2026-11-04. This is a navigation and integration map, not a runtime verification or production-readiness assessment. Dependency versions below are declared in package.json.

## Workspace locations

| Part | Absolute location | Notes |
| --- | --- | --- |
| Mobile frontend | `D:\Projects\Projects\zipp\mobile` | Expo / React Native application; parent directory contains `.git` |
| New backend | `D:\Projects\Projects\zipp\backend` | M0 verified; M1 implemented/unverified; M2-M6 backend source present, verification/mobile integration pending; see `docs/backend/M6_VERIFICATION.md` and earlier milestone evidence |
| Legacy backend (reference only) | `D:\Projects\zipp\zipp_app\Zipp_Backend` | Historical NestJS API; do not import its code/schema/secrets into the new backend |
| Frontend product reference | `D:\Projects\Projects\zipp\docs\Zipp_Detailed_PRD_Green.pdf` | Product requirements |
| Additional requirements and diagrams | `D:\Projects\zipp\zipp_app` | PRD/SRS documents and ride, delivery, wallet diagrams |
| Older index | `D:\Projects\zipp\zipp_app\WORKSPACE_INDEX.md` | Stale: describes backend as the only codebase |

No AGENTS.md was found in the inspected project trees or checked ancestor directories. No standalone admin frontend was found in either inspected code root. Dependencies, generated output, and secret environment values are excluded from this index.

2026-11-12 continuation: M3 finance backend source and its nine-table local development migration are present (18 application tables total). Payment simulation remains disabled; runtime/security/race verification and mobile integration are pending. See [M3 guide](docs/backend/M3_FINANCE.md) and [evidence](docs/backend/M3_VERIFICATION.md). M4-M9 implementation remains future work; older status text below is historical.

## Backend development planning (added 2026-11-06)

The original source inventory reflects 2026-11-04. A root [AGENTS.md](AGENTS.md) now provides workspace instructions. User direction supersedes the earlier legacy-backend stabilization plan: build everything from scratch in `backend/` inside this workspace. The [backend development pack](docs/backend/README.md) defines architecture, containers, CI/CD and capacity targets. M0 was verified on 2026-11-08; [M0 evidence](docs/backend/M0_VERIFICATION.md). M1 implementation is complete with verification pending; [M1 evidence](docs/backend/M1_VERIFICATION.md). M2 identity/accounts backend is present and its eight new tables were applied to local `zipp_dev` on 2026-11-12; runtime/security verification and mobile integration remain pending; [M2 evidence](docs/backend/M2_VERIFICATION.md) and [setup](backend/README.md). M3-M9 implementation remains pending. Hosting waits for full implementation, authorized verification and explicit deployment authorization. The separate legacy backend remains untouched. Backend module/command descriptions below are historical legacy inventory, not new implementation or proof of readiness.

## Frontend

2026-11-13 M6 continuation: delivery booking/custody/proof/return/tracking source is complete against ADR 0009, and the ten-table migration file is present (45 application tables, readiness marker `m6`). Application to local `zipp_dev` is not confirmed, so migrate before booting the API. Static gates passed: typecheck incl. tests, build/contracts, lint, format, boundaries and Prisma validate. Tests are written but unrun. Deliveries remain disabled by default; mobile integration, real SMS/storage and native tracking are pending. See [M6 guide](docs/backend/M6_DELIVERIES.md) and [evidence](docs/backend/M6_VERIFICATION.md). M7-M9 implementation remains future work.

2026-11-13 M5 continuation: ride/dispatch and shared job assignment source plus nine-table local migration are present (35 application tables total). Booking/hold/quote and completion/settlement are designed to commit together; driver/job uniqueness is shared with future deliveries. See [M5 guide](docs/backend/M5_RIDES_DISPATCH.md) and [evidence](docs/backend/M5_VERIFICATION.md). Rides remain disabled by default; runtime/race/native verification and mobile integration are pending. M6-M9 implementation remains future work; older status notes below are historical.

2026-11-12 M4 continuation: driver/pricing backend source and an eight-table development migration are present (26 application tables total). Upload/pricing adapters remain disabled by default; sample fares are development fixtures. See [M4 guide](docs/backend/M4_DRIVERS_PRICING.md) and [evidence](docs/backend/M4_VERIFICATION.md). Runtime/security/native verification and mobile integration remain pending; M5-M9 implementation is future work.

Declared stack: Expo ~58.0.19, React 19.3.0, React Native 0.88.0, TypeScript ~6.0.3, React Navigation 7, TanStack React Query 5, i18next, AsyncStorage, Expo Location/Image Picker, and react-native-webview. There are 80 files under `mobile/src` and 11 test files under `mobile/tests` at indexing time.

Entry chain: `index.ts` registers `App.tsx`, which exports `src/App.tsx`. The latter loads fonts, i18n, query client, safe areas, navigation, and role/profile/saved-place/notification/wallet/activity providers.

All paths in this section are relative to the mobile root.

| Area | Files / directories | Responsibility |
| --- | --- | --- |
| Navigation | `src/navigation/RootNavigator.tsx`, `types.ts` | Splash, welcome, signup, login, phone verification, role selection, main tabs, role guide, saved places, ride booking, delivery |
| Main tabs | `src/screens/MainTabsScreen.tsx`, `src/components/FloatingAppBar.tsx` | Home, Activity, Messages, Account; Messages currently shows an empty state |
| Home | `src/screens/RoleHomeScreen.tsx`, `src/hooks/useHomeSheet.ts` | Map, service entry points, wallet and notification access |
| Ride booking | `src/screens/BookRideScreen.tsx`, `src/hooks/useRideLifecycle.ts`, `src/services/rideEvents.ts` | Stops, vehicle preview, driver approach, arrival/PIN, journey, payment, receipt/rating |
| Delivery | `src/screens/DeliveryScreen.tsx`, `src/hooks/useDeliveryLifecycle.ts`, `src/services/deliveryFlow.ts` | Receiving/sending perspective, package/contact/photo form, courier tracking, handover/payment |
| Wallet | `src/contexts/WalletContext.tsx`, `src/services/walletLedger.ts`, `walletEvents.ts`, `src/components/WalletTopUp.tsx`, `WalletSheetContent.tsx` | Local holds, settlement, deposits, top-up UI |
| Activity | `src/screens/ActivityScreen.tsx`, `src/contexts/ActivityContext.tsx`, `src/services/activityHistory.ts` | Ride/delivery history and details |
| Saved places | `src/screens/SavedPlacesScreen.tsx`, `src/contexts/SavedPlacesContext.tsx` | AsyncStorage persistence, keyed by profile phone or guest |
| Maps | `src/components/maps/RideMap.tsx`, `mapDocument.ts`, `mapTheme.ts`, `mapGeometry.ts` | MapLibre inside WebView; OpenFreeMap style/data and custom overlays |
| Places / routing | `src/services/placeSearch.ts`, `roadRoute.ts`, `src/hooks/usePlaceSuggestions.ts`, `usePickupAddress.ts`, `useRoadRoute.ts`, `useMyLocation.ts` | Photon search/reverse lookup, OSRM road geometry, device location |
| API foundation | `src/services/apiClient.ts`, `src/config/environment.ts`, `src/query/client.ts` | Generic JSON fetch helper, API URL, React Query client |
| Shared presentation | `src/components`, `src/theme`, `src/constants`, `src/i18n`, `src/utils` | UI primitives, map sheets, colors, translations, formatting, responsive type |
| Configuration | `app.json`, `app.config.js`, `eas.json`, `tsconfig.json`, `.env.example` | Expo/native build configuration and public variable template |

Frontend runtime state is mostly local. Ride/delivery event publishers are in-process adapters, not network subscriptions. Development simulations and sample balances/fares/identities exist. Saved places already persist locally, despite older README text calling them session-only. API helper searches found no feature callers; authentication screens currently navigate locally rather than authenticate with the backend. No Socket.IO client dependency is declared.

Public frontend configuration keys:

- `EXPO_PUBLIC_API_URL`: configure the full API base, including `/api/v1`, when connecting the API helper.
- `EXPO_PUBLIC_PLACE_SEARCH_URL`: Photon-compatible endpoint; source defaults to the public Photon endpoint.
- `EXPO_PUBLIC_ROUTING_URL`: OSRM-compatible driving endpoint; source defaults to the public OSRM endpoint.

## Legacy backend inventory (historical reference only)

Declared stack: NestJS 11, TypeScript ^5.4.5, Prisma ^6.6.0 with PostgreSQL, Redis, BullMQ, Socket.IO, JWT/Passport, class-validator, Twilio, and social identity libraries. There are 102 files under `src` at indexing time.

Entry chain: `src/main.ts` creates `AppModule`, enables validation, exception filtering, logging and CORS, and listens on `PORT` (default 3000). REST prefix: `/api/v1`. Optional `REDIS_URL` enables the Socket.IO Redis adapter; dispatch and notifications separately use `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD`.

All paths in this section are relative to the backend root. Module rows point to `src/modules/<name>`; controllers expose routes, services hold business logic, and DTOs validate inputs.

| Module | REST prefix / transport | Responsibility |
| --- | --- | --- |
| `auth` | `/auth` | Register/login, phone verification, OTP, 2FA, refresh/logout, password reset, social auth, magic links, phone linking |
| `users` | `/users` | Current profile, password, avatar, account deletion, admin user controls |
| `drivers` | `/drivers` | Driver profile, vehicle, documents, online status/location, administrative review |
| `wallet` | `/wallet` | Balance/history, top-up, withdrawal, provider webhooks, finance processing |
| `pricing` | `/pricing` | Fare estimate, active pricing, pricing rule administration |
| `dispatch` | `/dispatch` | Driver acceptance for trips/deliveries, candidate matching and BullMQ retry jobs |
| `trips` | `/trips` | Booking/history, arrival/start/completion/cancellation/dispute, PIN and wallet lifecycle |
| `deliveries` | `/deliveries` | Booking/history, pickup/transit/completion/cancellation/dispute |
| `notifications` | `/notifications` | Device token registration/removal, SMS service and notification events |
| `support` | `/support` | Tickets/messages and agent workflows |
| `admin` | `/admin` | Dashboard, user status, action logs |
| `fraud` | `/fraud` | Alert creation/listing and human review |
| `gateways` | Socket.IO `/location`, `/trips`, `/deliveries` | JWT handshake middleware, driver location/tracking, dispatch and lifecycle broadcasts |

Supporting files:

- `src/app.module.ts`: registers all the modules above, global configuration, scheduler, and Prisma.
- `src/common`: current-user/roles decorators, roles guard, exception filter, logging interceptor.
- `src/prisma/prisma.service.ts`, `prisma.module.ts`: database access and lifecycle.
- `prisma/schema.prisma`: 24 models, 20 enums. Identity: User, UserRole, OTPCode, TwoFactorAuth, BackupCode, RefreshToken, SocialAccount. Finance: Wallet, WalletLedger, WithdrawalRequest. Drivers: DriverProfile, Vehicle, DriverDocument, DriverLocation. Operations: Trip, TripLog, Delivery, DeliveryLog, Rating. Configuration/support/audit: PricingRule, SupportTicket, SupportMessage, AdminActionLog, FraudAlert.
- `prisma/migrations`: two local migrations, initialization and social accounts. Backend `.gitignore` currently ignores this directory.
- `prisma/seed.ts`: initial seed data.
- `docs/*-api.md`: per-domain REST and WebSocket references; `docs/Zipp_API_Postman_Collection.json` and `docs/zipp-test-ui.html`: manual API tooling.

Dispatch currently uses latitude/longitude, SQL bounding-box filtering and Haversine distance. The README mentions PostGIS, but the dispatch implementation explicitly does not use a PostGIS geometry column.

## Historical frontend/legacy-backend connection map

These were intended integration points for the legacy backend, not verified working connections. New backend contracts are designed afresh under the development pack and must include explicit mobile mappings.

| Frontend boundary | Backend counterpart | Current gap |
| --- | --- | --- |
| Login/signup/verification and ProfileContext | `auth`, `users` | API calls, token storage/refresh, authenticated profile hydration |
| Ride booking and rideEvents | `pricing`, `trips`, `dispatch`, `/trips`, `/location` | Server quotes/bookings, authenticated lifecycle/GPS event adapter |
| Delivery and deliveryFlow | `pricing`, `deliveries`, `dispatch`, `/deliveries`, `/location` | Server delivery lifecycle/PIN/dispatch, photo upload |
| WalletContext, walletLedger, walletEvents, top-up UI | `wallet` | Server-authoritative balance, holds/settlement and confirmed provider payments |
| ActivityContext / activityHistory | Trip/delivery history routes | Persistent server history, reconciliation and resuming active bookings |
| NotificationContext | `notifications`, gateways | Device registration, push delivery and authenticated event ingestion |
| Role/driver UI | `drivers` | Driver onboarding, review status, availability and live location integration |
| SavedPlacesContext | No dedicated saved-place module identified | Currently device-local persistence only |

Backend follow-up landmarks found while indexing: auth SMS and magic-link email delivery contain provider TODOs; wallet provider initiation and webhook HMAC verification contain TODOs. Gateway JWT configuration uses `JWT_SECRET`, while REST auth uses `JWT_ACCESS_SECRET`; reconcile when connecting clients. The backend README's admin/fraud/gateway phase status is stale: all three are registered in AppModule. Swagger is mentioned in the README, but `main.ts` does not set up Swagger or `/api/docs`.

## Commands and validation

Run commands from the appropriate project root:

| Project | Command | Purpose |
| --- | --- | --- |
| Mobile | `npm install` | Install declared dependencies |
| Mobile | `npm start` / `npm run android` / `npm run ios` | Start Expo development workflow |
| Mobile | `npm run typecheck` | TypeScript check |
| Mobile | `node --test tests/*.test.cjs` | Existing Node test suite; requires installed local dependencies |
| Backend | `npm install` | Install declared dependencies |
| Backend | `npm run start:dev` | Nest development server |
| Backend | `npm run build` | Production compilation |
| Backend | `npx tsc --noEmit --skipLibCheck` | TypeScript check |
| Backend | `npm run prisma:generate` | Generate Prisma client |
| Backend | `npm run prisma:migrate:dev` / `npm run prisma:seed` | Mutating database setup commands; use only against the intended development database |

Backend declares `npm test` as `jest`, but no Jest dependency or automated test files were found in the inspected source. Existing frontend tests cover wallet/top-up, saved places, routing/search, map markers, ride lifecycle/payment, delivery, and activity history. No builds, tests, servers, migrations or seed operations were run for this indexing task. Source inspection establishes locations and current boundaries only.
