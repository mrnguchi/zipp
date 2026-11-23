# ADR 0005: financial retries, error boundaries and meaningful naming

Date: 2026-11-12. Status: accepted design for M3; implementation and verification pending.

## Context

The user requires safe handling of network interruptions, consistent errors across the system and meaningful code/database names. Client disconnects and provider timeouts can occur after a payment effect; retries cannot be treated as new financial actions. The user also asked whether idempotency expires.

## Decision

Adopt [Financial reliability, errors and naming](../FINANCIAL_RELIABILITY.md) as the M3 implementation contract. Use PostgreSQL-backed scoped request identities and business uniqueness, short atomic state/ledger/outbox transactions, bounded worker recovery and provider reconciliation. Keep uncertain payments pending; never infer failure from a timeout.

Retain the safe response snapshot for an initial 24 hours after terminal completion. Pending operations do not expire. Preserve the minimal duplicate-prevention identity for the financial record's retention lifecycle; snapshot expiry returns an expired-key conflict with authorized status recovery rather than executing a new payment. Do not introduce destructive cleanup before archive/retention and old-key behavior are defined. Provider deduplication windows are separate and must be verified during provider integration.

Classify errors in domain/application/adapters and translate centrally at each transport. Catch only where useful; workers persist recovery state instead of throwing HTTP exceptions. Define stable codes and safe correlation IDs. Use descriptive plural snake_case SQL tables, explicit units/foreign keys/timestamps, singular PascalCase types and camelCase fields, with documented mappings.

## Alternatives and consequences

Process-local deduplication cannot protect multiple instances or survive restart. Deleting financial key identities after a short TTL can turn a delayed retry into another charge. Keeping complete response bodies forever adds avoidable retention; therefore separate response snapshot expiry from durable duplicate prevention. Extra PostgreSQL records/indexes and reconciliation procedures are required; no new service/package is selected by this decision.

M3 must document and implement these contracts before claiming compliance. This ADR adds no runtime behavior, migration, provider integration or mobile change. Tests may be written, but remain unrun until explicit user authorization. Hosting remains deferred.
