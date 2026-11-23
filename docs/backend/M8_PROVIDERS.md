# M8 provider integration — incremental plan

Updated 2026-11-23. The user authorized moving to M8 and selected **Smobilpay S3P** for payments. This supersedes the earlier M8 hold; it does not complete M7. No Smobilpay sandbox account exists yet, SMS is not selected, and no provider call/install/test/paid resource/live payment is authorized or executed by this plan. Read [ADR 0017](adr/0017-m8-smobilpay-provider-selection.md), [financial reliability](FINANCIAL_RELIABILITY.md), [finance guide](M3_FINANCE.md) and [M7 open work](M7_COMPLETION_CHECKLIST.md).

## Order of work

| Step | Deliverable | Status/dependency |
| --- | --- | --- |
| M8.1 | Payment requirements, Smobilpay documentation review, adapter design and sandbox onboarding checklist. | Initial planning/review present here; account-specific contract pending. |
| M8.2 | Local Smobilpay transport/authentication, strict contracts, disabled configuration and written test fixtures. | Next implementation slice; select the assigned API/auth contract before writing its signing/token behavior. |
| M8.3 | Wallet top-up collection end to end in source: payment method, number, quote/fee acceptance, provider attempt and status recovery. | Depends on M8.2 and enabled collection catalog/fee agreement. |
| M8.4 | Withdrawal payout in source, preserving existing hold, independent finance approval and immutable recipient/reference. | Depends on M8.3, payout entitlement and funded sandbox/settlement agreement. |
| M8.5 | Callback verification, durable deduplication, status queries, reversal handling and operator reconciliation/recovery. | Design alongside top-up; required before enabling either direction. |
| M8.6 | Selected SMS adapter for existing OTP and delivery-code boundaries. | Provider selection, sender approval, credentials and routing terms pending. |
| M8.7 | Real push, private storage/scanning and routing adapters, each as a separate slice. | Select provider/contract per slice; preserve outstanding M7 native/calling work. |
| M8.8 | On explicit command, isolated automated tests and provider sandbox acceptance; fix findings and record evidence. | No test runner, sandbox probe or money operation until commanded; no live enablement implied. |

Steps label implementation slices, not extra roadmap milestones. Work locally and keep defaults off. No new microservice, payment database or wallet ledger is needed merely to add a provider adapter. M9 remains measured capacity/recovery/pilot qualification, not a substitute for M8 correctness.

## Smobilpay review and contract gaps

The [user-selected reference](https://apidocs.smobilpay.com/s3papi/API-Reference.2066448558.html) links an [embedded reference labelled v3.2.0](https://s3papidoc.smobilpay.maviance.info/). The older [authentication page](https://apidocs.smobilpay.com/s3papi/Authentication.1578338286.html) documents signed s3pAuth requests; the linked reference describes OAuth 2.0 client credentials. Confirm the sandbox's supported version, base URL and authentication before implementation. Do not mix examples, guess a live endpoint or build automatic auth fallback.

The linked reference maps customer-to-Zipp collections to cashout discovery and Zipp-to-wallet payouts to cashin. This direction is from the **mobile wallet** perspective and must be confirmed against the account's enabled services. Both use quote/execute plus transaction status; preserve Smobilpay PTN and the assigned merchant transaction-reference field. Quotes are short-lived/single-use; package IDs are discovered, not copied from documentation examples. [Older concepts](https://apidocs.smobilpay.com/s3papi/S3P-API-Concepts.1578338258.html) also document a transaction-reference field differently, reinforcing the version gate.

Initial scope is Cameroon/XAF MTN/Orange mobile-wallet collections and payouts **if enabled on the merchant account**. This is not confirmation of Zipp's commercial eligibility, fees, refund/reversal product, service availability or sandbox access. Airtime, bills and vouchers are outside this wallet integration.

## First practical action: request sandbox access

Use Smobilpay/Maviance onboarding or its [service desk linked from the official overview](https://apidocs.smobilpay.com/s3papi/) to request a sandbox welcome pack. The assistant has not sent a message or created an account. Ask for:

- Sandbox base URL, exact API/specification version and authentication contract; credential storage/rotation requirements.
- Cameroon/XAF collection and payout entitlement for MTN/Orange; enabled discovery entries and permitted sandbox numbers/scenarios.
- Quote expiry, denominations/minimum/maximum amounts, fees, settlement/prefunding and whether customer/merchant bears each fee.
- Merchant-reference uniqueness/deduplication scope and retention, lookup behavior after an ambiguous execute, and whether a missing lookup definitively proves no payment happened.
- Callback enrollment, supported signature/raw-body format, delivery identity/retry window, status response fields and reversal/finality contract.
- Request/polling quotas, support escalation and account access requirements.

Keep private keys, access secrets, bearer tokens and callback secrets out of chat/Git/mobile variables/logs. A nonsecret version/base URL/auth-method summary can be shared for implementation. Backend hosting is not required for local source work; later callback qualification needs an explicitly authorized reachable HTTPS endpoint.

## Local implementation design

Reuse the finance module's exact XAF ledger, durable request identities, transaction/outbox and worker. The present `PaymentProvider.resolve` accepts reference/type/amount/local outcome only; it is a local simulation boundary, not a complete external payment contract. Extend it deliberately with persisted provider/account version, selected service/method, validated immutable payer/payee, quote, approved fee/currency data, external reference and explicit submit-versus-status workflow. No phone guessing from prefixes, silent quote repricing or raw provider response in public status.

Persist intent before network calls; keep all provider I/O outside PostgreSQL transactions. Lock and conditionally settle exactly once after authorized evidence matching the stored amount/currency/recipient/reference. Bound shared polling/concurrency and persist next eligibility time so replicas cannot multiply provider traffic. Do not let a lease expiry authorize resubmission. A fresh transport nonce/token is separate from the stable business payment identity.

Top-up: customer reviews amount/method/fees, one operation requests mobile-wallet collection, and Zipp credits only after matched verified final success. Payout: existing withdrawal reservation and independent approval precede one stable provider intent; unknown outcomes retain the hold. Never infer failure from HTTP timeout, quote expiry, missing callback or empty lookup alone. Reconcile before any supported retry. Reversal after a confirmed credit needs a recorded recovery policy; do not edit/delete ledger history or silently drive a user negative.

Callbacks must have bounded raw-body capture, verified provider authentication, current reference/amount checks and durable duplicate prevention before any financial action. Persist authenticated receipt/recovery intent, acknowledge promptly, then resolve safely. Unsigned/forged/mismatched messages cannot credit wallets or release holds. Verification details depend on the assigned contract. Tests for these behaviors can be written without running them.

## SMS shortlist — provider not yet selected

Assume initial delivery to Cameroon +237, consistent with existing project development scope; confirm expansion countries before commercial selection. Use one provider initially, behind existing server-owned code-delivery ports. Delivery speed/price/coverage claims require an actual quote and authorized acceptance, not a marketing page.

| Candidate | Why evaluate it | What to confirm |
| --- | --- | --- |
| [AvlyText](https://www.avlytext.com/en) | Lists Cameroon and offers an SMS API/custom sender names; local candidate to evaluate first. | Transactional OTP permission, MTN/Orange routes, sender registration, delivery receipts, latency/support and written pricing. Its linked Postman documentation timed out during review; full API/security qualification is pending. |
| [Twilio](https://www.twilio.com/en-us/guidelines/cm/sms) | Publishes specific Cameroon sender/network guidance. | Registered ZIPP sender, MTN route approval, account eligibility and per-segment/encoding charges. Documentation says two-way SMS is unsupported and MTN needs a preregistered alphanumeric sender. |
| [Orange Business Messaging Ngage](https://developer.orange.com/apis/sms-cm/) | Official local business alternative named by Orange. | Current API access, all-operator transactional coverage, sender setup, receipts and commercial terms. Avoid building on SMS Cameroon 2.0: Orange marks it deprecated with discontinuation on **2026-12-01**. |

Recommendation: ask AvlyText for transactional OTP terms first and compare its quote with Twilio. Evaluate Orange through its replacement business offer only. This is a shortlist, not an assertion that a provider meets Zipp's delivery/SLA needs. SMS-provider choice does not change OTP/PIN generation, bounded attempts, one-time use or server privacy rules.

## Evidence

Official references reviewed 2026-11-23; existing package/lockfile/runtime unchanged. Documents/finance provider boundary inspected; no adapter installed/implemented/enabled by this planning slice. No database/service/migration/API/provider operation or test was run. M7 remains incomplete and tracked separately; proceeding to M8 planning is user-authorized, not acceptance of M7.
