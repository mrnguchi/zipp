# M4 driver onboarding, private documents and pricing

Updated 2026-11-12. Backend implementation and local migration are present; **runtime/security/race verification remains pending on command**. Mobile integration, production providers and full realtime tracking are not enabled. See [ADR 0007](adr/0007-m4-driver-documents-location-and-pricing.md), [evidence](M4_VERIFICATION.md) and [tracking/calling design](LIVE_TRACKING_AND_CALLS.md).

M5 continuation (2026-11-13): current local readiness marker is `m5`, with 35 application tables. Shared job assignments now block occupied driver offline/vehicle edits and dispatch eligibility; accepted-job tracking uses fresh/stale participant snapshots through the public driver boundary. See [M5 setup/recovery](M5_RIDES_DISPATCH.md). Historical M4 counts below describe that milestone.

## Local schema and feature ownership

Eight new tables: `driver_applications`, `driver_vehicles`, `driver_documents`, `driver_reviews`, `driver_presence`, `service_areas`, `pricing_policies`, `price_quotes`. The schema now contains 26 application tables, plus Prisma migration bookkeeping. Naming uses meaningful snake_case, explicit foreign keys/units and Prisma camelCase mappings. No legacy schema/code was imported.

Drivers owns application/vehicle/document lifecycle, independent admin decisions and initial location intake. Identity owns DRIVER role changes through its public facade. Pricing owns service areas, immutable policy versions and server quotes. Future booking uses `DriversFacade.assertDispatchEligible` and `PricingFacade.consumeQuote` within the shared transaction; it must add the assignment invariants and financial hold under the same transaction and consistent user/aggregate lock order. M4 does not book jobs, charge cancellation fees or create arbitrary driver credits.

## Application and review flow

1. Authenticated user saves vehicle metadata, creating a DRAFT application. Registration plate is trimmed/uppercase, manufacture year is bounded to current year +1, seats to 1-7. This is preliminary metadata, not proof that the vehicle is legal or eligible.
2. Create upload intents for IDENTITY, LICENSE, VEHICLE_REGISTRATION and INSURANCE. These are provisional product requirements, not a statement of local legal requirements. Each intent binds application revision, allowed type, exact bytes/SHA-256 and future document expiry (within ten years).
3. Upload bytes using the owned intent, then submit only when the vehicle and all four unexpired STORED document kinds exist. SUBMITTED applications freeze edits/uploads.
4. A different ADMIN with recent enrolled MFA reviews the expected revision. Approval requires explicit `documentsReviewed:true`, a reason, nonempty unique eligible service classes and all required unexpired documents. File-signature checks are not malware clearance; the admin must actually inspect the documents through protected downloads. Approval commits review history, selected document statuses, application state and DRIVER role together.
5. Rejection stores its reason/history. Owner edits a rejected application to open the next DRAFT revision and uploads that revision's documents. Editing an approved vehicle similarly opens a new revision, revokes DRIVER eligibility and ends the location epoch until re-approved. Revisions cap at 20; each revision permits at most 20 upload intents. These limits require product review before pilot.
6. ADMIN suspension removes DRIVER and online presence immediately. Owner cannot bypass suspension by editing; ADMIN can reopen it to REJECTED for a new draft/review. Stale expected revisions and repeated incompatible decisions return conflicts; they do not duplicate approvals. Applicant status/detail includes review reasons so resubmission is actionable.

Driver role alone never establishes current eligibility: status, vehicle, approved classes, document expiry, current auth session and fresh position are checked again. Account suspension/session revocation cannot keep an old epoch dispatch-eligible. Location is device-reported, not GPS spoof-proof evidence.

## Private storage and recovery

Storage is disabled by default. For explicitly authorized future local operation, set ignored `.env`:

```dotenv
DRIVER_UPLOADS_ENABLED=true
DRIVER_DOCUMENT_STORAGE=local
DRIVER_DOCUMENT_ROOT=./.local/private-documents
```

Compose uses a private named `private-documents` volume mounted only in the API at `/var/lib/zipp/documents`; the image prepares it for the non-root user. No new storage service/package was installed. Docker rebuild/start and filesystem permission behavior remain unverified. Outside containers, choose a dedicated persistent private directory; OS temporary storage is not an implicit enabled default. `.local` is excluded from Git and image context. Worker/migration containers do not mount documents. Local filesystem access is rejected in production; shared private object storage, malware scanning/quarantine and actual provider/native checks are pre-production gates.

Intent creation returns a document ID and upload path with a ten-minute deadline. Send raw `application/octet-stream` to that path with exact Content-Length; no multipart/base64, original filename, client path or storage URL is accepted. JPEG/PNG/PDF content signatures, exact length/digest, size <=3 MiB, owner, current draft revision and upload expiry are checked. The transport permits two simultaneous uploads per process to bound buffering, with a ten-second read deadline; this is memory admission, not distributed correctness. JSON remains limited to 16 KiB.

Writes use random UUID keys and exclusive private files. Identical retries can recover a file-write/DB-acknowledgement loss; changed bytes do not overwrite an object. Storage I/O occurs outside database transactions. After a revision/status change or database failure, an orphan can remain private. Create a new bounded intent or use a reviewed operator procedure; never reset data, expose a directory, silently treat incomplete files as uploaded, or recursively delete a computed path. Crash-durable writes, permission/symlink behavior, interrupted transfers and orphan reconciliation still require authorized verification. No automatic destructive cleanup is enabled.

Downloads require the owner or recent-MFA ADMIN and are audited. Responses are attachments with no-store/nosniff; storage keys and complete paths are not returned. Integrity mismatch or unavailable bytes produce a safe failure. Owner access to historical revision documents is deliberate; retention/archive policy and malware clearance remain pre-pilot work.

## Availability and location intake

Online requires approved vehicle/classes and unexpired approved documents. It returns a server-issued locationSessionId bound to that auth session, with a fixed maximum 12-hour expiry. Repeating online from the same live session returns its epoch; another session replaces it. Offline, suspension or reapplication clears position and invalidates the old epoch.

POST location requires schemaVersion 1, epoch ID, increasing sequence, finite coordinates, accuracy 0-100m and capturedAt. Captures must be <=15s old and <=5s ahead; subsequent capture time must increase. Updates are limited to one per three seconds under the driver/user lock. An initial movement filter allows 70m/s plus 200m uncertainty; implausible jumps reject the observation without a financial penalty. This threshold needs real-device tuning and cannot detect all spoofing.

Eligibility needs an accepted snapshot within 15s and an unexpired/current auth session. At 30s it is certainly unavailable; no stale snapshot is considered fresh. M4 stores only one private latest snapshot in PostgreSQL, not every sample or a public feed. Expiry makes it ineligible but does not physically erase its row; offline/replacement clears coordinates. Bounded stale-coordinate cleanup/retention must be finalized before pilot. M5/M7 add Redis geo/presence, authorized job subscriptions, REST resync and native background behavior. No socket/audio, nearby-driver directory or active assignment is claimed here.

## Sample pricing, routing and version changes

The user authorized sample fares to update later. Migration adds clearly labelled development-only service area `DEV_DOUALA_FIXTURE` (ID `00000000-0000-4000-8000-000000000004`) and immutable `development-v1` policies:

| Class | Base XAF | Per km XAF | Per minute XAF | Minimum XAF |
| --- | ---: | ---: | ---: | ---: |
| EVERYDAY | 500 | 200 | 30 | 1,000 |
| COMFORT | 700 | 280 | 42 | 1,400 |
| PREMIUM | 1,000 | 400 | 60 | 2,000 |
| DELIVERY_STANDARD | 400 | 150 | 20 | 800 |
| DELIVERY_EXPRESS | 600 | 225 | 30 | 1,200 |

All sample policies use night multiplier 12,500 bps at 22:00-06:00 Africa/Douala, commission 1,000 bps and illustrative pre-pickup cancellation fee 500 XAF. These are development fixtures, not approved commercial or provider rules. Cancellation is snapshotted for later lifecycle policy; M4 charges no fee. PRD Classic maps to EVERYDAY, Comfort Plus to PREMIUM and Comfort to COMFORT. Delivery keeps its sending/receiving/contact model for M6. Completion PIN is required later; no start PIN was added.

Quote issuance is disabled by default. Enable only for later authorized local operation with `PRICING_ENABLED=true` and `ROUTING_ADAPTER=fixture`. Production rejects that adapter. The fixture accepts only `(4.05,9.7)` to `(4.06,9.72)`, or reverse, within 0.000001 degrees. It returns fictional 5,000m/900s under `local-fictional-route-v1`; these are not measured road values. Other routes reject; there is no Haversine/client-distance fallback. No public routing endpoint was called. Real road routing, geometry/intermediate-area enforcement, licensing, provider timeout/cache/quota and regional coverage remain M8 work.

Fares use bigint XAF: base + ceiling(distanceMeters * perKm /1000) + ceiling(durationSeconds * perMinute /60), raised to minimum, then the night multiplier with final ceiling. Commission is a separate settlement policy, not an added customer fare here. The sample Everyday route is 1,950 XAF in daytime and 2,438 XAF at night. New quote calculation uses server time and immutable policy data; clients cannot supply distance, duration or price.

ADMIN with recent MFA can create an immutable service area or activate/deactivate it, and publish a new unique policy version. Publishing deactivates the previous active version for that area/class in a transaction; SQL permits only the active flag to change afterward. Area bounds do not change in place. Old unconsumed quotes are rejected after a policy/area change, never silently repriced. Rate/area changes are audited; review actual product rates and areas before pilot.

## Quotes, ownership and retries

POST quotes requires UUID v4 Idempotency-Key, serviceAreaId, serviceClass and pickup/destination coordinates. Request fingerprint and owner/key uniqueness prevent duplicate quote creation. Same key/input returns the original quote; changed input conflicts. A quote expires in 120 seconds. An expired unconsumed quote requires a deliberate new quote/new key; this is distinct from retained financial payment identities in [financial reliability](FINANCIAL_RELIABILITY.md).

Quotes contain amount/currency, endpoint and route measurements/version/fingerprint, policy ID and safe policy snapshot, expiry and ownership in storage. Only the owner can retrieve one. The trusted pricing facade consumes a current active-policy quote once in the future booking/hold transaction. Same booking identity can recover its own prior consumption after expiry; another booking conflicts. There is no public consume endpoint. M5 must bind booking ownership/service class, assignment and persistent idempotency; M4 alone cannot establish an atomic booking flow.

## API and integration map

All paths below use `/api/v1`, authenticated M2 sessions, strict request schemas, shared limits, safe errors and no-store responses. Generated OpenAPI defines 18 new operations (51 total). No frontend/native files or packages changed.

| Boundary | Routes |
| --- | --- |
| Own application | GET `/drivers/me`; PUT `/drivers/me/vehicle`; POST `/drivers/me/submit` |
| Private uploads | POST `/drivers/me/documents`; PUT `/drivers/me/documents/{id}/content`; GET `/driver-documents/{id}/content` |
| Availability/GPS | PUT `/drivers/me/availability`; POST `/drivers/me/location`; GET `/drivers/me/eligibility` |
| ADMIN review | GET `/admin/drivers`; GET `/admin/drivers/{id}`; POST `/admin/drivers/{id}/review` |
| Quotes/service areas | GET `/pricing/service-areas`; POST `/pricing/quotes`; GET `/pricing/quotes/{id}` |
| ADMIN pricing | POST `/admin/pricing/service-areas`; PATCH `/admin/pricing/service-areas/{id}`; POST `/admin/pricing/policies` |

Admin driver list returns summaries with owner ID, status/revision/classes and timestamps; detail fetches bounded document/review metadata. Pagination is chronological with UUID cursor, default 20/max50. No internal storage/auth-session paths are public. Wrong ownership returns safe not-found; MFA/permission failures remain distinct for authorized staff. Upload/storage/pricing unavailable uses safe 503; size 413, validation 400, state/revision/quote/location conflicts 409 and throttles 429. Interrupted connections cannot always receive an HTTP body; reconnect and fetch current state instead of assuming success.

Future mobile integration must map existing labels to canonical classes, replace client sample fare with server quotes, show expiry/requote, supply secure auth and monotonic location epochs, upload bounded binary files and never grant role from local preferences. Actual native permissions/background networking, object storage/scanning and road provider acceptance are separate gates. No documentation claims these integrations have already passed.

## Migration and remaining gates

`20261112010000_drivers_pricing` was applied only to identified local `zipp_dev` at loopback 55432 on 2026-11-12. It adds eight tables, constraints/grants, labelled development policies and readiness marker `m4`. No reset, test-DB migration, API/worker restart or Docker build occurred. Refresh pgAdmin `zipp_dev > Schemas > public > Tables`. Old images need reviewed marker/schema compatibility; no automatic down migration.

See [M4 evidence](M4_VERIFICATION.md) for actual build/static results and unrun tests. Before pilot, require full HTTP/file/authorization/race/security checks, real-device tracking, real provider storage/routing/scanning, retention/recovery policy, product fee/area approval and measured load. No 1,000-user capacity or production driver-verification claim is established.
