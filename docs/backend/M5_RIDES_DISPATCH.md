# M5 ride booking, dispatch and recovery

Updated 2026-11-13. Backend source and local development migration are present; **runtime/security/race verification and native integration remain pending on command**. No tests, scans, load runs or manual API/failure scenarios were executed. See [ADR 0008](adr/0008-m5-booking-assignment-and-ride-lifecycle.md), [evidence](M5_VERIFICATION.md), [financial reliability](FINANCIAL_RELIABILITY.md) and [tracking/calling design](LIVE_TRACKING_AND_CALLS.md).

## Ownership and local schema

`jobs` owns shared mobility job identities and active assignments. It has no dependency on identity, drivers, rides or finance. `rides` owns booking, offers/dispatch tasks, lifecycle/events, receipts/ratings/disputes. Other features participate only through public facades and the opaque transaction context. API never starts consumers; the existing independent worker gains an opt-in BullMQ ride dispatcher. No new dependency/image/service or legacy import was introduced.

Nine new tables: `mobility_jobs`, `active_job_assignments`, `rides`, `ride_requests`, `ride_offers`, `ride_events`, `ride_dispatch_tasks`, `ride_ratings`, `ride_disputes`. Total application models/tables: 35; Prisma migration bookkeeping is additional. M5 also adds `fund_reservations.captured_amount_xaf` so a cancellation fee can consume part of a larger reservation and refunds remain bounded by the actual capture.

The shared assignment table has a primary key on `driver_user_id` and a unique `mobility_job_id`: one active driver job across RIDE/DELIVERY, one driver per job. No delivery lifecycle is implemented by this table alone. A partial unique ride index allows one active requested ride per customer. Deferred constraints keep ride/job closure/assignment state and persisted event version consistent. These constraints exist in source/applied local SQL; their runtime/race behavior is not verified yet.

## Booking and wallet atomicity

POST booking accepts only `quoteId` plus the authenticated actor and UUID v4 Idempotency-Key. It requires an owned, unexpired ride-class quote from M4. It consumes that quote, snapshots server fare/commission/cancellation/area terms, creates a mobility job/ride, reserves the quoted funds, records durable request identity/audit/event and schedules dispatch in one transaction. No client fare, distance, driver identity or payment success is authoritative. An insufficient wallet rolls back all these changes, including quote consumption.

General M2 limits apply, plus shared Redis booking admission at five requests/minute/account (including retries); replays are bounded, not a rate-limit bypass. Redis loss fails admission closed. A lost commit acknowledgement requires the same request key/current status recovery, never an assumed rollback or second booking.

Ride/payment development flags do not prove financial readiness. Wallet state is authoritative PostgreSQL; bookings use existing available funds. Local mock top-ups must be enabled separately for a later authorized development scenario; M5 does not automatically credit wallets or contact real providers.

## Eligible drivers and the acceptance winner

Discovery and acceptance require active account/current login, DRIVER role, approved application/vehicle/class, all required current-revision unexpired approved documents, online location epoch, fresh sufficiently accurate observation, no active assignment, pickup radius/service-area membership and a valid unexpired offer. Device coordinates are observations, not spoof-proof evidence. Candidate discovery returns at most 50 nearest observations; after busy/prior-offer filtering, at most ten new offers are made per wave. Acceptance repeats the authoritative checks because conditions can change after discovery.

Dispatch starts at 2km, expands to 5km and 10km, with 30-second waves and a 120-second total search deadline. Offers expire no later than their wave/deadline. A driver is offered a given ride once. Remaining waves do not resend the same ride to a driver who declined or missed it. After the third wave, the worker waits for the fixed search deadline; exhausted search releases the hold and ends NO_DRIVER atomically. A disabled service area or inactive customer during search also ends it safely. Query plans/fairness/actual pickup ETAs need later verification; proximity is not road-routing fare input.

If two eligible drivers accept, the first valid transaction that commits wins. Network arrival and database scheduling affect the winner; client tap timestamps cannot decide it. The losing driver receives a safe conflict, normally RIDE_ALREADY_ASSIGNED. If one driver tries two rides/deliveries, DRIVER_BUSY/unique-assignment enforcement rejects the competing claim. The entire losing transaction rolls back. Same-key retries of a successful acceptance return that existing ride instead of claiming another job.

User rows lock in sorted UUID order, followed by driver aggregates when needed, job/ride, and pricing area/wallet aggregates. Drivers' location/suspension and financial changes use the same user-lock boundary. If assignment changes between an initial read and obtaining the required user locks, return RIDE_STATE_CHANGED; retry the same key rather than acquiring an extra user lock out of order. Known rolled-back PostgreSQL deadlocks/serialization conflicts use the existing bounded transaction retry policy. Database constraints are the final guard, not in-memory or Redis locks.

Offers contain pickup, class, quoted amount, radius and expiry; they omit customer contact, destination and PIN. Decline returns only an acknowledgement. Only current ride participants retrieve full ride/tracking/event/receipt state. A previous unsuccessful offer is not authorization to observe the assigned ride.

## Lifecycle, location and completion proof

SEARCHING -> ASSIGNED -> ARRIVED -> IN_PROGRESS -> COMPLETED. Customer can cancel SEARCHING/ASSIGNED/ARRIVED; assigned driver can cancel before start. NO_DRIVER is a search-only terminal outcome. No automatic timeout/network-loss path frees an accepted assignment. Offline/vehicle edits are blocked while assigned; suspension can stop driver eligibility without freeing the assignment, requiring reasoned support resolution. Account deletion also checks shared active jobs to avoid stranding a customer or driver.

Arrival and start require the assigned current eligible driver and a fresh observation within 500m of pickup. Completion requires a fresh observation within 500m of destination and the customer completion code. These proximity tolerances are initial development policies; no start PIN was added. Native physical-device/background behavior remains unverified.

The customer explicitly requests a six-digit CSPRNG completion code after assignment. Its raw value is returned once in a no-store response, never stored/logged/placed in offers/events. A purpose-bound HMAC digest uses the existing identity digest key; code expires after 30 minutes. Issuance/rotation is capped at one/minute and three/hour using PostgreSQL state. Lost issuance responses can request a bounded new code, invalidating the previous one. Issuance does not reset failed verification counters.

At most five failed PIN proofs are admitted per 15-minute window. Failed attempt counters/audit commit before the safe error response; throwing inside that transaction would incorrectly roll them back. Further proofs receive 429/Retry-After. Expired/invalid proof never settles money. Completion request fingerprints HMAC the low-entropy proof rather than storing its raw value/plain SHA digest. Same-key completion replay is allowed to recover the result without still-fresh GPS after the job has ended. Another key cannot create another capture.

Identity digest-key rotation currently invalidates outstanding codes and can change PIN-based replay fingerprints; perform reviewed key lifecycle/recovery and GET existing ride status, never generate a second settlement to recover. Key version/rotation overlap remains a pre-production gate.

Successful completion atomically posts the original held fare to driver/platform at snapshotted commission, closes the ride/job, releases the active assignment and commits the versioned event/request/audit. Money remains exact XAF bigint internally and decimal strings over HTTP. Receipt shows quoted/charged/refunded/net paid values; driver views also include earnings/platform share.

## Cancellation, partial capture and disputes

Unassigned customer cancellation releases all funds. After assignment and before start, customer cancellation captures the M4 development cancellation fee capped at quoted amount. The rest of the reservation is released in the same transaction. Driver cancellation before start releases the customer's hold without a fee. This uses the user-authorized development policy; no approved live cancellation rule is implied.

Example: hold 1,950 XAF, cancellation fee 500 XAF, commission 1,000 bps. Release the full 1,950 reservation; post customer -500, driver +450, platform +50, leaving 1,450 XAF available again. The reservation retains original amount and explicit captured amount 500. Refunds cannot reverse the larger 1,950 hold; cumulative rounding uses the captured 500. Older full captures are backfilled at their original amount without changing posted ledger history.

After start, participants open a persisted dispute rather than automatically stopping/charging/refunding. Completed rides and charged cancellations can also be disputed. An independent ADMIN with recent enrolled MFA and a reason can release an unresolved in-progress hold (cancel without charge) or fully refund the original completed/cancellation capture. Refund checks recipient/platform available funds; insufficient funds leave the dispute unresolved for review. There is no force-completion/client-paid/provider-success override. Admin decisions/request reasons/audit are retained. Broader partial-service compensation, extra support tickets and dashboards remain M7 policy/scope.

Driver rating is one immutable customer rating per completed ride, stars 1-5, optional bounded text. Same input recovers it; different rating input conflicts rather than silently rewriting history. No aggregate driver score/earnings report or fraud/penalty policy is claimed yet.

## Recovery, event history and tracking

Ride events are immutable, versioned notification/outbox history committed with state. The envelope has id, type/schemaVersion, aggregateId/version, occurredAt and minimal `{rideId}` payload. Events contain no PIN/contact/GPS. GET events returns at most 50 after a supplied version; the current snapshot remains authoritative. GET active rides/history provides restart recovery. No push/socket delivery guarantee or exactly-once queue delivery is claimed.

Participant tracking uses the M4 validated latest driver snapshot: fresh within 15s, explicitly `stale:true` between 15-30s, unavailable beyond 30s or when account/session/approval is invalid. Terminal/no-assignment rides expose no live coordinates. Coordinates already returned cannot be remotely erased; frontend must honor stale/terminal state. API clients can poll bounded snapshots/events; this is backend REST recovery, not completed Socket.IO fanout or a native live map. M7 transport/native integration and physical-device/network evidence remain open. No continuous GPS outbox write or audio path was added.

PostgreSQL dispatch tasks are the durable work source. Existing worker scans up to 20 due tasks every two seconds, relays versioned references through BullMQ `ride-dispatch`, concurrency two/process. A 30-second database lease claims execution; the consumer reloads state and refuses stale claims/accepted jobs. Lost queues and expired leases recover from database rows. Producer commands have a two-second timeout. Temporary worker failures back off with jitter; eight unresolved attempts mark review required and retain the hold. Customer can still cancel a searching ride, or independent recent-MFA ADMIN can retry dispatch with a reason. An expired search resumed later resolves NO_DRIVER; it is not given a new search deadline.

Operator procedure: identify the ride ID and inspect current ride/task/assignment/reservation/event versions with a restricted connection or the participant's API response. Admin operations currently take an identified ride ID; no staff ride dashboard/list is added. Do not reset volumes, delete ledger/history, flush Redis as a financial repair, directly clear an occupied driver's slot, or assume a lost connection means cancellation. Use supported cancel/dispute/retry operations. Persisted review tasks, assignment or refund mismatches require a reviewed forward repair, not a force-success shortcut.

## API, flags and migration

All paths use `/api/v1`, active M2 bearer sessions, ownership/role validation, strict bounded schemas, shared quotas and safe no-store errors. Financial mutations require UUID v4 Idempotency-Key (completion-code issuance is a bounded non-financial rotation). Same actor/action/key/input returns the existing logical ride/current status; different input conflicts. Retain identities after the 24-hour terminal response window, returning IDEMPOTENCY_KEY_EXPIRED with the existing ride ID in the documented `operationId` recovery field. For a new post-terminal action such as rating, expiry is measured after the later of completion and request creation. No cleanup/key reuse is enabled.

| Boundary | Routes |
| --- | --- |
| Booking/history/reconnect | POST `/rides`; GET `/rides`; GET `/rides/active`; GET `/rides/{id}` |
| Events/tracking/receipt | GET `/rides/{id}/events?afterVersion=...`; GET `/rides/{id}/tracking`; GET `/rides/{id}/receipt` |
| Customer/participant actions | POST `/rides/{id}/cancel`; POST `/rides/{id}/completion-pin`; POST `/rides/{id}/rating`; POST `/rides/{id}/disputes` |
| Driver offers/lifecycle | GET `/driver/rides/offers`; POST `/driver/rides/offers/{id}/accept` or `/decline`; POST `/driver/rides/{id}/arrive`, `/start`, `/complete` |
| ADMIN operations | POST `/admin/rides/{id}/resolve-dispute`; POST `/admin/rides/{id}/retry-dispatch` |

Generated OpenAPI now has 70 operations (19 new). `ride-event.schema.json` and `ride-dispatch-command.schema.json` publish the notification/work reference contracts. Offer listing is capped at 30; history uses chronological UUID cursor pagination, default 20/max50. Unexpected errors are safe 500; state/ownership/purpose failures, overload/dependency behavior follow the shared error contract. No token/PIN/private payload is a log label or query parameter.

`RIDES_ENABLED=false` is the default for API and worker. Future local operation requires explicitly enabling rides plus configured identity/M4 pricing and funded development wallets; no setting was enabled during implementation. Production ride enablement is rejected until real providers and runtime acceptance exist. Worker uses authoritative identity/session reads without receiving API signing/encryption keys; it never creates completion codes. No extra service or public socket was introduced.

Migration `20261113000000_rides_dispatch` was applied only to identified local `zipp_dev` at loopback 55432 on 2026-11-13. It adds nine tables/constraints, partial-capture metadata and readiness marker `m5`. No customer credit, seed/reset, test-database mutation, Docker rebuild or API/worker startup occurred. Refresh pgAdmin `zipp_dev > Schemas > public > Tables`. Old images need reviewed marker/schema compatibility; no automatic destructive down migration.

Remaining gates are in [M5 evidence](M5_VERIFICATION.md): real PostgreSQL races/recovery/privileges, Redis outage/rate checks, HTTP authorization/error contracts, native map/background integration, provider/product policy and measured capacity. Backend source and SQL application do not establish verified M5 completion or 1,000-user capability.
