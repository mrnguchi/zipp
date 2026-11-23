# Financial reliability, errors and naming

Decision date: 2026-11-12. Status: required M3 contract; backend source is now present, **runtime verification remains pending**. See [M3 implementation/evidence](M3_VERIFICATION.md), [ADR 0005](adr/0005-financial-retries-errors-and-naming.md), [architecture](ARCHITECTURE.md) and [roadmap](ROADMAP.md). Requirements below are not proof of passing behavior and do not authorize tests, deployment or real payments.

## Responsibilities and source of truth

PostgreSQL owns wallet balances, immutable ledger postings, reservations, payment attempts, request identities and pending work. Redis is for shared admission limits and queue delivery; it cannot authorize spending or establish payment success. API and worker retain their existing separate containers. No additional infrastructure is required by this policy.

Money uses exact integer XAF: PostgreSQL BIGINT, TypeScript bigint and documented decimal strings in JSON. Never authorize an amount from a cached balance or accept client/provider UI claims as confirmation. Ledger transfers must balance; holds and unconfirmed payment attempts remain distinct from posted money.

## Network interruption and recovery

| Interruption | Required behavior |
| --- | --- |
| Client disconnects before receiving a response | The outcome is unknown to the client. Retain the original operation key; retry the same payload/key or retrieve the operation status. A disconnected response is not a cancellation. |
| API commits then crashes before responding | The request identity, financial mutation and outbox intent must have committed together. The retry retrieves the persisted operation; it cannot repeat the financial effect. |
| PostgreSQL unavailable | Do not change balances in Redis/memory or return success. Return a safe availability error when possible. A lost commit acknowledgement is ambiguous: resolve using the same persisted operation identity on recovery. |
| Queue Redis unavailable | Already-committed outbox work remains in PostgreSQL for later relay. Do not describe an accepted pending payment as completed. M2's admission limiter can separately reject new API traffic while cache Redis is unavailable. |
| Worker crashes or receives duplicate work | Resume from persisted state and deduplicate effects in PostgreSQL. Recover expired work leases. A lease expiry is permission to inspect/resume work, not proof that an external payment failed. |
| Payment provider times out or returns an ambiguous result | Keep the attempt pending confirmation. Query provider status/use verified callbacks and reconciliation. Do not automatically credit a top-up, release a payout reservation or submit a new payout reference. |
| Provider confirms failure | Apply the documented failure transition once. Release a withdrawal reservation only when non-payment is established or an approved reconciliation procedure resolves it. |

External network calls must happen outside database transactions. Persist the intended provider action first; use a stable provider request reference/idempotency identity. If a provider cannot safely deduplicate an ambiguous retry, query/reconcile or escalate for review instead of automatically resubmitting. M8 must verify each provider's actual semantics and retention window before enabling that adapter.

Use explicit request/provider/database deadlines, bounded exponential backoff with jitter and a maximum retry budget. Document the chosen numbers per adapter before implementation. Exhausting automatic retries moves work to a reviewable state; it does not invent a financial outcome. Limit worker concurrency and queue payload size; payloads reference persisted operations and contain no credentials.

On reconnect, a future mobile adapter must fetch authoritative operation status, wallet balance and paginated history. Show pending confirmation explicitly. Do not subtract/credit money a second time from local retry logic. A new key is reserved for a deliberate new business action.

## Persistent idempotency

Financial mutation endpoints require an `Idempotency-Key` header containing a client-generated UUID. Validate its format and length before database work. Scope uniqueness by authenticated actor, stable operation type and key; authentication, ownership and current permissions apply on every retry/status lookup. Possessing a key is not authorization. Keys contain no phone numbers, tokens or other personal data.

Persist a canonical fingerprint of validated business input, the scope/key identity, operation ID, lifecycle timestamps and a safe response snapshot where appropriate. Define canonicalization per endpoint: normalized exact amount/currency, target and relevant business identifiers; exclude access tokens, request IDs and incidental transport headers. Do not store raw authentication/provider payloads in the fingerprint record.

| Request | Result |
| --- | --- |
| First valid submission | Atomically claim the unique request identity and create the business operation, related financial changes, audit and outbox intent as required. |
| Same actor/type/key and same input | Return the same logical operation. If work is pending, return its current pending status; never call the provider again solely because the client retried. |
| Same actor/type/key with different input | `409 IDEMPOTENCY_CONFLICT`; no financial mutation. |
| Simultaneous identical submissions | Database uniqueness and transaction/lock rules choose one operation. The other returns its existing/pending result or a bounded in-progress response; never rely on an in-memory map. |
| Different keys targeting the same capture/refund/provider receipt | Business-level uniqueness, state transitions and refundable/available amount checks still apply. Request keys alone do not protect against duplicate business effects. |

Reject malformed input and unauthorized requests before creating a business operation. Once an operation is durably created, its terminal failure or pending state remains attached to that key. Do not permanently cache arbitrary 500/503 responses as business outcomes. If the commit result is unknown, resolve the existing identity rather than assuming nothing happened.

### Expiry and retention

The initial **response snapshot retention is 24 hours after the operation reaches a terminal state**. This is a design default for M3, not a currently enabled cleanup job. Store `response_expires_at`; document it in the endpoint contract. Pending/uncertain operations do not expire just because a response window or worker lease elapsed.

Expiry of a response snapshot must never make the original financial key reusable:

- Retain a minimal durable duplicate-prevention record linking the scoped key identity, fingerprint and operation ID for the financial operation's retention lifecycle. It does not need the original response body or secrets.
- After snapshot expiry, return `409 IDEMPOTENCY_KEY_EXPIRED` with a safe operation ID and documented status lookup, subject to current authorization. Do not create another payment and do not instruct the app to automatically generate a replacement key.
- The client retrieves current operation state. A new key can be used only for a deliberate new action after the old outcome is resolved.
- Provider receipt/event uniqueness, original-payment references, settlement uniqueness and refund limits survive response-cache cleanup. Provider-side key expiry is independent and cannot justify blind resubmission.
- Financial records and minimal duplicate-prevention records must follow an approved retention/archive policy. No automatic deletion is introduced in M3 until that policy and the behavior of archived keys are defined. Retention is not a claim that every record is stored forever.

Example: a 5,000 XAF top-up completes, but the client loses the response. Retrying its key within the response window returns the existing operation. Retrying after snapshot expiry returns an expired-key conflict and the existing operation ID. Neither retry creates another top-up. An expiring OTP, access token, work lease and idempotency response snapshot have separate purposes and lifetimes.

## Errors at every layer

Every public operation and dependency boundary must specify its expected failures and recovery behavior. This does not require a try/catch around every function. Catch where recovery, safe translation, transaction cleanup or useful context is possible; propagate otherwise. Never swallow an exception, return fake success or throw raw provider/database messages to users.

- Domain rules use meaningful failures such as insufficient funds, invalid transition or refund limit exceeded; they import no HTTP/Nest/Prisma/provider code.
- Application use cases classify business conflicts, authorization failures, retriable dependencies and ambiguous outcomes. A timeout is not a terminal payment failure.
- Infrastructure adapters translate known database/provider failures while preserving internal cause safely. Retry only documented transient failures and only when duplicate protection makes the action safe.
- HTTP handlers and the central exception filter map failures to the API contract. Background workers have no HTTP response: persist state/retry metadata and emit redacted operational diagnostics. Future sockets need their own error envelope/resync behavior.
- Unexpected errors return a generic message with the current request ID; restricted logs carry safe diagnostic context. Do not log passwords, OTPs, tokens, complete connection strings, payment payloads or unnecessary personal data.

| HTTP status | Example stable code | Client behavior |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Correct input; no automatic retry of the same invalid input. |
| 401 | UNAUTHENTICATED | Refresh/sign in through the identity flow; preserve any unresolved financial key. |
| 403 | FORBIDDEN or RECENT_MFA_REQUIRED | Obtain the required authorization/proof; do not retry in a loop. |
| 404 | NOT_FOUND | Record does not exist or is unavailable to this actor; avoid ownership leaks. |
| 409 | INSUFFICIENT_FUNDS, INVALID_TRANSITION, IDEMPOTENCY_CONFLICT, IDEMPOTENCY_KEY_EXPIRED | Follow the specific business recovery/status lookup; do not automatically create a new payment key. |
| 413 | PAYLOAD_TOO_LARGE | Reduce the request; do not resend unchanged. |
| 429 | RATE_LIMITED | Honor Retry-After, with bounded retries using the original financial key. |
| 500 | INTERNAL_ERROR | Outcome may be uncertain; use the original key/status lookup, with bounded retry. |
| 503 | DEPENDENCY_UNAVAILABLE | Honor Retry-After when supplied; retain the original key and resolve status after recovery. |

Known asynchronous work accepted durably should return `202` with an operation ID and pending state; `202` does not mean payment succeeded. A provider timeout after durable acceptance can remain a pending operation rather than becoming a generic HTTP failure. Describe each endpoint's exact response semantics in OpenAPI before implementation.

The target envelope is `{code,message,requestId}` with explicitly documented, safe recovery fields such as `operationId` when needed. Never replay an old request's correlation ID in a new response. `Retry-After` is an HTTP header. The existing M2 error handler is a starting point; M3-specific domain mappings and recovery fields remain to be implemented. This policy does not claim every current function already meets the target.

## Meaningful names

Follow existing conventions without renaming unrelated M2 tables. Names must reveal ownership, business meaning, unit and lifecycle. Avoid generic `data`, `record`, `ref`, `status1` and ambiguous `balance` in public financial contracts.

| Artifact | Convention/examples |
| --- | --- |
| Database tables | Plural snake_case: `wallet_accounts`, `ledger_transactions`, `ledger_postings`, `fund_reservations`, `payment_attempts`, `withdrawal_requests`, `idempotency_records`, `outbox_events`. These are planned concepts, not a finalized migration/table count. |
| Columns and foreign keys | snake_case: `wallet_account_id`, `ledger_transaction_id`, `payment_attempt_id`, `provider_reference`, `operation_id`. Distinguish internal IDs, client keys and provider references. |
| Money and time | `amount_xaf`, `available_amount_xaf`, `reserved_amount_xaf`; `created_at`, `confirmed_at`, `response_expires_at`. UTC timestamps; distinguish business expiry, provider deadline and work lease. |
| TypeScript / Prisma | camelCase fields such as `amountXaf`; singular PascalCase models/types. Map to SQL explicitly with Prisma mappings. Never expose raw bigint through JSON. |
| Files and actions | kebab-case files; focused PascalCase classes such as `ReserveWalletFunds`, `ConfirmTopUpPayment`, `ReleaseFundReservation`. Follow framework suffixes for transport/module files. |
| Statuses | Workflow-specific uppercase enum values with documented allowed transitions; `PENDING_CONFIRMATION`, `CONFIRMED`, `FAILED` for a payment attempt where applicable. Avoid one universal status enum for payments, holds and outbox delivery. |
| Constraints/indexes | Descriptive table/column/purpose names, consistent suffixes and PostgreSQL identifier length limits. Name uniqueness guarantees so a reviewer can identify the invariant. |

## Required M3 implementation/acceptance work

Record worked ledger examples, canonical request fingerprints, endpoint errors/status lookup, transaction/lock order, business uniqueness and provider ambiguity rules before money code. Add reviewed migrations, OpenAPI examples and operator recovery procedures. Keep mock adapters explicitly local/test and rejected in production.

Write scenarios for disconnect-after-commit, concurrent same/different keys, insufficient funds races, response expiry, pending work beyond expiry, duplicate callbacks, worker crash before/after provider action, queue loss, unknown provider outcomes, refund bounds, authorization changes on replay and secret-free errors. These are acceptance requirements, not evidence of passing behavior. **Do not execute tests, scans or failure probes until the user explicitly commands them.**
