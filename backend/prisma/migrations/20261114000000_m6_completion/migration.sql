BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Original server-issued capabilities cannot prove the new client-owned TTL intent.
ALTER TABLE delivery_tracking_capabilities ADD COLUMN requested_ttl_seconds INTEGER NOT NULL DEFAULT 0;
UPDATE delivery_tracking_capabilities SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP);
ALTER TABLE delivery_tracking_capabilities ADD CONSTRAINT delivery_tracking_requested_ttl CHECK((requested_ttl_seconds=0 AND revoked_at IS NOT NULL) OR requested_ttl_seconds BETWEEN 600 AND 86400);
-- Source validation alone must not permit one phone to prove both custody ends.
ALTER TABLE deliveries ADD CONSTRAINT delivery_distinct_contact_phones CHECK(sender_phone<>recipient_phone);
UPDATE platform_metadata SET value='m6' WHERE key='foundation';
COMMIT;
