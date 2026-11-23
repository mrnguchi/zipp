-- Source only. Identify target and review both M7 migrations before applying.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING','CAPTURED','SUPPRESSED','REVIEW_REQUIRED');
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_id_user_id_key UNIQUE(id,user_id);
CREATE TABLE notification_devices (
 id UUID PRIMARY KEY,owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 session_id UUID NOT NULL,platform VARCHAR(10) NOT NULL CHECK(platform IN ('ANDROID','IOS')),
 provider VARCHAR(10) NOT NULL DEFAULT 'LOCAL' CHECK(provider='LOCAL'),
 proof_hash CHAR(64) NOT NULL CHECK(proof_hash ~ '^[a-f0-9]{64}$'),
 token_hash CHAR(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),token_ciphertext VARCHAR(1024),
 generation INTEGER NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 1000000),
 expires_at TIMESTAMPTZ(3) NOT NULL,revoked_at TIMESTAMPTZ(3),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT notification_devices_id_owner_user_id_key UNIQUE(id,owner_user_id),
 CONSTRAINT notification_device_session_owner FOREIGN KEY(session_id,owner_user_id) REFERENCES auth_sessions(id,user_id) ON DELETE RESTRICT,
 CONSTRAINT notification_device_lifetime CHECK(expires_at>created_at),
 CONSTRAINT notification_device_secret_state CHECK(
  (revoked_at IS NULL AND token_ciphertext IS NOT NULL AND token_ciphertext ~ '^v1[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$') OR
  (revoked_at IS NOT NULL AND token_ciphertext IS NULL))
);
CREATE INDEX notification_devices_owner_user_id_revoked_at_expires_at_idx ON notification_devices(owner_user_id,revoked_at,expires_at);
CREATE TABLE notification_outbox (
 id UUID PRIMARY KEY,source_event_id UUID NOT NULL REFERENCES communication_events(id) ON DELETE RESTRICT,
 recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,event_type VARCHAR(20) NOT NULL DEFAULT 'ACTIVITY' CHECK(event_type='ACTIVITY'),
 expires_at TIMESTAMPTZ(3) NOT NULL,completed_at TIMESTAMPTZ(3),created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT notification_outbox_id_recipient_user_id_key UNIQUE(id,recipient_user_id),
 CONSTRAINT notification_outbox_source_event_id_recipient_user_id_key UNIQUE(source_event_id,recipient_user_id),
 CONSTRAINT notification_intent_lifetime CHECK(expires_at>created_at)
);
CREATE INDEX notification_outbox_completed_at_created_at_idx ON notification_outbox(completed_at,created_at);
CREATE TABLE notification_inbox (
 id UUID PRIMARY KEY,owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 read_at TIMESTAMPTZ(3),created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT notification_inbox_id_owner_user_id_key UNIQUE(id,owner_user_id),
 CONSTRAINT notification_inbox_intent_owner FOREIGN KEY(id,owner_user_id) REFERENCES notification_outbox(id,recipient_user_id) ON DELETE RESTRICT
);
CREATE INDEX notification_inbox_owner_user_id_id_idx ON notification_inbox(owner_user_id,id);
CREATE TABLE notification_deliveries (
 id UUID PRIMARY KEY,notification_id UUID NOT NULL,owner_user_id UUID NOT NULL,device_id UUID NOT NULL,
 device_generation INTEGER NOT NULL CHECK(device_generation BETWEEN 1 AND 1000000),
 status "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 available_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,lease_token UUID,lease_expires_at TIMESTAMPTZ(3),completed_at TIMESTAMPTZ(3),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT notification_delivery_identity UNIQUE(notification_id,device_id,device_generation),
 CONSTRAINT notification_delivery_inbox_owner FOREIGN KEY(notification_id,owner_user_id) REFERENCES notification_inbox(id,owner_user_id) ON DELETE RESTRICT,
 CONSTRAINT notification_delivery_device_owner FOREIGN KEY(device_id,owner_user_id) REFERENCES notification_devices(id,owner_user_id) ON DELETE RESTRICT,
 CONSTRAINT notification_delivery_lease_shape CHECK((lease_token IS NULL)=(lease_expires_at IS NULL)),
 CONSTRAINT notification_delivery_state CHECK(
  (status='PENDING' AND completed_at IS NULL) OR
  (status<>'PENDING' AND completed_at IS NOT NULL AND lease_token IS NULL)),
 CONSTRAINT notification_delivery_capture CHECK(status<>'CAPTURED' OR attempts>=1),
 CONSTRAINT notification_delivery_review CHECK(status<>'REVIEW_REQUIRED' OR attempts=8)
);
CREATE INDEX notification_deliveries_status_available_at_lease_expires_at_idx ON notification_deliveries(status,available_at,lease_expires_at);
CREATE FUNCTION guard_notification_device() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE active_count INTEGER;
BEGIN
 PERFORM id FROM public.users WHERE id=NEW.owner_user_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN
  IF OLD.owner_user_id<>NEW.owner_user_id OR OLD.proof_hash<>NEW.proof_hash OR OLD.provider<>NEW.provider
   OR (OLD.revoked_at IS NOT NULL AND NEW IS DISTINCT FROM OLD)
   OR NEW.generation<OLD.generation OR NEW.generation>OLD.generation+1
   OR ((OLD.token_hash<>NEW.token_hash OR OLD.session_id<>NEW.session_id OR OLD.platform<>NEW.platform)
    AND NEW.generation<>OLD.generation+1) THEN RAISE EXCEPTION 'invalid device generation or ownership' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.revoked_at IS NULL AND NEW.expires_at>CURRENT_TIMESTAMP THEN
  SELECT count(*) INTO active_count FROM public.notification_devices WHERE owner_user_id=NEW.owner_user_id AND id<>NEW.id
   AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP;
  IF active_count>=5 THEN RAISE EXCEPTION 'notification device limit' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_notification_device() FROM PUBLIC;
CREATE TRIGGER notification_device_guard BEFORE INSERT OR UPDATE ON notification_devices FOR EACH ROW EXECUTE FUNCTION guard_notification_device();
CREATE FUNCTION guard_notification_read() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN RAISE EXCEPTION 'notification read receipt is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_notification_read() FROM PUBLIC;
CREATE TRIGGER notification_read_monotonic BEFORE UPDATE ON notification_inbox FOR EACH ROW EXECUTE FUNCTION guard_notification_read();
GRANT SELECT,INSERT ON notification_devices,notification_outbox,notification_inbox,notification_deliveries TO zipp_app;
GRANT UPDATE(session_id,platform,token_hash,token_ciphertext,generation,expires_at,revoked_at,updated_at) ON notification_devices TO zipp_app;
GRANT UPDATE(completed_at) ON notification_outbox TO zipp_app;
GRANT UPDATE(read_at) ON notification_inbox TO zipp_app;
GRANT UPDATE(status,attempts,available_at,lease_token,lease_expires_at,completed_at) ON notification_deliveries TO zipp_app;
INSERT INTO platform_metadata(key,value) VALUES('notifications','m7_3');
COMMIT;
