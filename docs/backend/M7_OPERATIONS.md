# M7.5 staff operations

Updated 2026-11-23. Source, contracts, migration and tests are written. Runtime/security/race verification and migration execution are pending. [ADR 0015](adr/0015-m7-staff-operations.md) defines scope; [M7 evidence](M7_VERIFICATION.md) remains authoritative. M7 and calling are not complete; M8 has not started.

## Boundaries and permissions

`backend/src/modules/operations` owns manually raised review cases, versioned review history and immutable command receipts. Reuse current PostgreSQL/Redis, identity/session/MFA checks and public owning facades. No dependency, worker, service or admin website is added. `OPERATIONS_ENABLED=false`; enabling requires identity and `operations=m7_5` schema marker. Do not enable before identified migration and authorized acceptance.

Every request requires current account/session, appropriate current role, recent MFA (five minutes), bounded validation, Redis/global rate limits and no-store responses. SUPPORT/ADMIN can read nonfinancial subjects/cases; FINANCE/ADMIN can read payment subjects/cases and the page report. ADMIN may change nonstaff account ACTIVE/SUSPENDED state through an IN_REVIEW account case. Having created a case is not a permanent access grant. Stale token roles and old MFA timestamps do not authorize a replay.

Summaries expose only IDs, controlled status and relevant revision/assignment/custody or exact XAF amount. No phones, addresses, location, private documents, codes, payment references/secrets or chat are returned. A generic account suspension is not driver approval/suspension; driver verification remains its existing owner workflow. Manual flags are allegations, never proven fraud or automatic punishment. Descriptions are private bounded text stored in cases only, absent from metadata events, audit and logs.

## API

All paths use `/api/v1/operations`.

| Method/path | Meaning |
| --- | --- |
| GET `/capabilities` | Current role's allowed categories and action limits. |
| GET `/subjects/{type}/{id}?reasonCode=...` | Audited minimal owner-controlled summary; ACCOUNT/DRIVER/RIDE/DELIVERY/PAYMENT. |
| GET `/cases` | Authorized categories only; optional subjectType/status, limit <=50, afterId UUID. |
| POST `/cases` | `{subjectType,subjectId,reasonCode,description}`; description 10–2,000 characters. |
| GET `/cases/{id}` | Authorized case detail. |
| GET `/cases/{id}/events` | Metadata history, afterVersion/limit <=50. |
| POST `/cases/{id}/reviews` | `{expectedVersion,status,reasonCode}`; explicit reviewed transitions. |
| POST `/cases/{id}/account-status` | ADMIN, `{expectedVersion,expectedAccountStatus,accountStatus,reasonCode}`. |
| GET `/finance/report` | FINANCE/ADMIN, bounded page of operation status/amount metadata. |

Writes require a UUID-v4 Idempotency-Key scoped actor/action/key; canonical HMAC fingerprints and immutable `{caseId,version,status,accountStatus}` receipts. Same key/input recovers its original receipt after current authorization, changed input conflicts. Receipts describe the accepted version, not a mutable current snapshot. Read GET to reconcile. No expiry/reuse or automatic archive/delete. Query cursors paginate by ascending UUID and do not promise a snapshot-consistent full export across concurrent writes.

Case transitions: OPEN -> IN_REVIEW or DISMISSED; IN_REVIEW -> RESOLVED or DISMISSED; either terminal state -> IN_REVIEW for an explicit reopened review. Account-status actions leave the case IN_REVIEW but increment its version. Every write commits case version, event, receipt and audit together. A 1,000-event history cap requires a new reviewed case rather than truncating history. Locks use sorted identity IDs before owning aggregate/case locks. The application never performs Redis/provider I/O inside the transaction.

Account action requires an ACCOUNT case, current IN_REVIEW state, exact version and account status. Reject self and any ADMIN/SUPPORT/FINANCE target. Suspension checks shared customer/courier assignments, **bound sender/recipient duties**, and unresolved financial operations under the target identity lock. It revokes target sessions atomically; reactivation cannot un-revoke them. No job/hold/custody/call-slot release, force-completed job, password/MFA reset, staff role mutation or deletion. A conflict is resolved through the owning workflow, not a force flag.

The finance report explicitly returns `scope:PAGE`, a page's **requested amount** total as a decimal XAF string, and `providerReconciled:false`. It is neither net funds nor full ledger/provider reconciliation. No arbitrary wallet credit/debit, balance assignment, provider-success declaration or irreversible financial override is exposed.

## Existing owner workflows

Use existing `/admin/drivers` review, `/communications/support/tickets`, `/finance/withdrawals`, `/finance/operations/{id}/reconcile`, ride issue review/refund and delivery issue/return authorization. Their independent-role/MFA/reason/version/hold/custody restrictions remain in force. A case may record review, but resolving it does not execute or replace an owning action. Source money/job constraints are not runtime acceptance evidence.

## Storage, failures and remaining work

`20261123000000_staff_operations` adds `operations_cases`, `operations_case_events`, `operations_commands`: controlled shapes, subject-existence check, restricted append-only history/receipts, event/version consistency and matching receipt guards. Source defines 61 application tables; all four M7 migrations remain unapplied. Last identified applied local evidence remains 45/base m6. On 2026-11-23 the configured local target was identified as 127.0.0.1:55432/zipp_dev, zipp_owner; connection failed and Docker engine was unavailable. No migration/reset/seed ran. Never infer database state from Prisma model count.

Expected errors: 400 malformed bounds/keys; 401 current session/account failure; 403 role/MFA (RECENT_MFA_REQUIRED); 404 missing subject/case; 409 CASE_VERSION_CONFLICT/CASE_VERSION_LIMIT/INVALID_TRANSITION/ACCOUNT_STATE_CONFLICT/ACTIVE_JOB_CONFLICT/ACCOUNT_HAS_UNRESOLVED_FUNDS/IDEMPOTENCY_CONFLICT; 429 quota with Retry-After; 503 default-disabled/dependency failure. Preserve unresolved keys after ambiguous network/commit outcomes. Initial actor quotas: 20 writes/min and 60 reads/min plus global limits; no measured capacity claim.

Written/unrun: domain transition/version/schema/config; restricted PostgreSQL duplicate-create/review races, current role/MFA, receipt conflict, append-only/deferred rollback, blocked guard, session revocation/reactivation, staff/self target; owning delivery contact detection; real HTTP/global guard and injection/bounds/no-store. The operations integration suite explicitly doubles Redis and job/finance guards; it does not prove their runtime behavior. Still verify full owner mixed races, active sender/recipient assignment vs status changes, SQL clean/upgrade/grants, DB/Redis faults/unknown commits, query plans/budgets, retention/privacy approval and any future admin frontend. No tests execute until commanded.
