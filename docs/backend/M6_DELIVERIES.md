# M6 delivery lifecycle, custody and restricted tracking

Updated 2026-11-14. Backend/mobile API source and both local development migrations are present; **runtime/security/race/native verification and native/mobile runtime verification remain pending on command**. No tests, scans, load runs or manual API/failure scenarios were executed. See [ADR 0009](adr/0009-m6-delivery-custody-and-restricted-tracking.md), [evidence](M6_VERIFICATION.md), [M5 rides/dispatch](M5_RIDES_DISPATCH.md), [financial reliability](FINANCIAL_RELIABILITY.md) and [tracking/calling design](LIVE_TRACKING_AND_CALLS.md).

Current completion details: [mobile integration/runbook](M6_MOBILE_INTEGRATION.md) and [ADR 0010](adr/0010-m6-completion-and-mobile-contracts.md). Both `20261113010000_deliveries_custody` and `20261114000000_m6_completion` were applied to identified local `zipp_dev` on 2026-11-14 (45 application tables; marker `m6`). No test database was changed.

## Ownership and local schema

`deliveries` owns bookings, package photos, offers/dispatch tasks, custody lifecycle/events, contact proofs, issues/returns, ratings and tracking capabilities. It reuses the `jobs`, `finance`, `drivers`, `pricing` and `identity` public facades and the opaque transaction context; no other feature imports delivery internals. The API never starts consumers. The existing independent worker gains an opt-in BullMQ delivery dispatcher (`platform/queues/delivery-dispatch.worker.ts`). No new dependency, image or service was introduced, and no legacy code was imported.

Ten new tables: `deliveries`, `delivery_package_photos`, `delivery_requests`, `delivery_offers`, `delivery_events`, `delivery_dispatch_tasks`, `delivery_proofs`, `delivery_issues`, `delivery_ratings`, `delivery_tracking_capabilities`. The total is now 45 application models/tables; Prisma migration bookkeeping is additional. Migration `20261113010000_deliveries_custody` adds foreign keys, contract checks, a forward-only transition trigger, deferred event/version, custody/settlement, proof/custody and assignment consistency triggers, least-privilege runtime grants, and readiness marker `m6`. The API readiness check requires marker `m6`; both local development migrations are confirmed applied here, and other targets need an identified migration before booting. Constraints exist in source SQL; their runtime and race behavior is unverified.

## Flags and local adapters

| Variable | Default | Meaning |
| --- | --- | --- |
| `DELIVERIES_ENABLED` | `false` | Booking, lifecycle, codes, tracking and dispatch. Requires `DELIVERY_CODE_ADAPTER=local`. |
| `DELIVERY_MEDIA_ENABLED` | `false` | Package photo intents/upload/download. Requires `DELIVERY_MEDIA_ADAPTER=local` and a private persistent `DELIVERY_MEDIA_ROOT`. |

Either flag is rejected at startup when `NODE_ENV=production`. Compose mounts the private `private-delivery-photos` volume on the API only. The local code adapter writes one file per request to a private temporary mailbox in the API process. `npm run delivery:code -- <requestId>` prints an unexpired development code, on explicit developer invocation only (inside the API container when using Compose). It is not an endpoint, not real SMS and not proof that anyone holds the phone. Real SMS, object storage and malware scanning are M8/pre-production work.

## Booking and wallet atomicity

1. Create a photo intent (`POST /delivery-photos`: JPEG/PNG, 16 B to 3 MiB, SHA-256), then `PUT /delivery-photos/{id}/content` with the raw bytes within 10 minutes. Length, digest and file signature are checked before a create-only private write outside any transaction.
2. Obtain a `DELIVERY_STANDARD` or `DELIVERY_EXPRESS` quote from M4 pricing.
3. `POST /deliveries` with a UUID v4 `Idempotency-Key`, the quote, perspective, both contacts (name and E.164 phone), package description, size (SMALL/MEDIUM/LARGE), declared grams (maxima 2/10/20 kg), photo, explicit contact-sharing consent and terms acceptance.

The booker pays in both perspectives. SENDING requires the booker's verified phone as sender, and RECEIVING requires it as recipient. **Sender and recipient phones must differ**, so pickup/return codes (sender) and handover codes (recipient) always reach different phones. Registered contacts are resolved server-side without revealing whether a number is registered. Quote consumption, server term snapshots, photo binding (one photo per booking), shared DELIVERY job, wallet hold, request identity, event and dispatch task commit in one transaction. An insufficient wallet rolls everything back, including quote consumption. Bookers have at most three active deliveries. Booking admission is five per minute per account through shared Redis limits.

## Dispatch and the acceptance winner

Waves search 2, 5 and 10 km with at most 10 offers per wave, 30-second offers and a 120-second total search. Offers contain pickup, package size/weight, class and quoted amount only: no contacts, destination, photo or secret. The booker and both contacts are never offered the job. Acceptance re-checks DRIVER role, eligibility, freshness, area and radius under locks. The shared `active_job_assignments` slot excludes concurrent rides and deliveries for the same courier. Search exhaustion, an inactive booker or a disabled area ends the search with `NO_COURIER` and releases the hold once. Worker or queue loss never releases an accepted assignment; persisted leases retry with backoff and require review after eight failed attempts. An ADMIN can resume a searching delivery with a reason.

## Custody lifecycle and proofs

`SEARCHING → ASSIGNED → AT_PICKUP → COLLECTED → IN_TRANSIT → AT_DESTINATION → DELIVERED`, with custody `WITH_SENDER → WITH_COURIER → WITH_RECIPIENT`.

| Step | Courier route | Requirement |
| --- | --- | --- |
| Arrive at pickup | `arrive-pickup` | Fresh position within 500 m of pickup |
| Collect | `collect` | Within 500 m and the sender's PICKUP code |
| In transit | `transit` | Assigned courier |
| Arrive at destination | `arrive-destination` | Fresh position within 500 m of destination |
| Deliver | `deliver` | Within 500 m and the recipient's HANDOVER code; captures the original fare and releases the assignment |

Codes (`POST /deliveries/{id}/contact-codes`) are six-digit CSPRNG values. They are bound to delivery, purpose and request through an HMAC digest, expire in 15 minutes, and are limited to one issuance per minute and three per hour per purpose. Five failed proofs within 15 minutes block that purpose, and the failure counter commits before the error returns. The booker, the courier or the relevant contact may request a code. The raw code goes only to the immutable contact phone, and the caller receives only `{requestId, purpose, expiresAt}`. If delivery fails, that exact digest is invalidated and a safe 503 is returned.

## After collection: issues, returns and refunds

After collection there is no ordinary cancellation, expiry or refund. Participants open a bounded issue: `RECIPIENT_UNREACHABLE`, `RETURN_REQUEST` or `DISPUTE`. An independent ADMIN with recent MFA, who is not a participant, may authorize `RETURNING` with a reason and settlement `RELEASE_HOLD` or `CAPTURE_ORIGINAL`. The courier then arrives back at pickup (500 m) and proves the sender's RETURN code. That commits `RETURNED`/`RETURNED_TO_SENDER`, the settlement, job closure and assignment release together. No force-delivered/returned shortcut exists. A suspended courier can still report custody location and complete a return for the package it holds (`custody-location-session`, `custody-location`, `arrive-return`, `confirm-return`), but gains no new dispatch eligibility.

Before collection, the booker may cancel. The fee is free while searching, and the snapshotted cancellation fee applies once a courier is assigned (development fixture: 500 XAF). The assigned courier may cancel with a full release. A charged terminal delivery can be fully refunded once through an ADMIN-resolved issue.

## Reads, resync and tracking

Participants read the snapshot, history, active list, versioned events (`afterVersion` resync), receipt (booker), issues and precise participant tracking with a stale flag. Contacts and money are shown only to the parties entitled to them. A finished courier loses the package photo and contact phones. The booker can share up to five active (20 total) tracking capabilities lasting 10 minutes to 24 hours (default 8 hours), can list them, and can revoke them. The client generates and retains a CSPRNG secret; registration returns metadata only, and identical ID/secret/TTL input can replay that metadata. The secret is sent for viewing only as `Authorization: Bearer`, never in a URL. Follow ADR 0010 for the updated strict registration body and explicit native sharing. `GET /delivery-tracking` returns status, timestamps and, during courier custody only, a position rounded to three decimals: no contacts, photo, code, money, identity or mutation. Event payloads carry only the delivery ID. Socket.IO/push delivery is not claimed.

## Development pricing

Sample fixtures (`development-v1`, area `DEV_DOUALA_FIXTURE`): DELIVERY_STANDARD has base 400 XAF, 150 XAF/km, 20 XAF/min and a 800 XAF minimum. DELIVERY_EXPRESS has base 600, 225/km, 30/min and a 1,200 minimum. Both use night multiplier 1.25 (22:00–06:00 Africa/Douala), commission 10% and a 500 XAF cancellation fee. These are user-authorized development fixtures, not approved commercial rates.
