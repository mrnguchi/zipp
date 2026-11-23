-- Local control metadata only. No audio/SDP/ICE/credentials, provider provisioning or reset.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TYPE "CallStatus" AS ENUM ('RINGING','CONNECTING','REJECTED','MISSED','FAILED','ENDED');
CREATE TABLE call_sessions (
 id UUID PRIMARY KEY,job_id UUID NOT NULL REFERENCES mobility_jobs(id) ON DELETE RESTRICT,job_type "MobilityJobType" NOT NULL,
 caller_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,callee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 caller_session_id UUID NOT NULL,caller_device_id UUID NOT NULL,caller_device_generation INTEGER NOT NULL CHECK(caller_device_generation BETWEEN 1 AND 1000000),
 callee_session_id UUID,callee_device_id UUID,callee_device_generation INTEGER CHECK(callee_device_generation BETWEEN 1 AND 1000000),
 status "CallStatus" NOT NULL DEFAULT 'RINGING',version INTEGER NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 1000000),
 signal_epoch INTEGER NOT NULL DEFAULT 0 CHECK(signal_epoch IN (0,1)),ring_expires_at TIMESTAMPTZ(3) NOT NULL,connect_expires_at TIMESTAMPTZ(3),
 accepted_at TIMESTAMPTZ(3),ended_at TIMESTAMPTZ(3),end_reason VARCHAR(40),last_checked_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT call_distinct_participants CHECK(caller_user_id<>callee_user_id),
 CONSTRAINT call_caller_session FOREIGN KEY(caller_session_id,caller_user_id) REFERENCES auth_sessions(id,user_id) ON DELETE RESTRICT,
 CONSTRAINT call_callee_session FOREIGN KEY(callee_session_id,callee_user_id) REFERENCES auth_sessions(id,user_id) ON DELETE RESTRICT,
 CONSTRAINT call_caller_device FOREIGN KEY(caller_device_id,caller_user_id) REFERENCES notification_devices(id,owner_user_id) ON DELETE RESTRICT,
 CONSTRAINT call_callee_device FOREIGN KEY(callee_device_id,callee_user_id) REFERENCES notification_devices(id,owner_user_id) ON DELETE RESTRICT,
 CONSTRAINT call_device_claim_shape CHECK(
  (callee_session_id IS NULL AND callee_device_id IS NULL AND callee_device_generation IS NULL AND accepted_at IS NULL AND signal_epoch=0 AND connect_expires_at IS NULL) OR
  (callee_session_id IS NOT NULL AND callee_device_id IS NOT NULL AND callee_device_generation IS NOT NULL AND accepted_at IS NOT NULL AND signal_epoch=1 AND connect_expires_at IS NOT NULL)),
 CONSTRAINT call_deadline_bounds CHECK(ring_expires_at>created_at AND ring_expires_at<=created_at+INTERVAL '31 seconds'
  AND (connect_expires_at IS NULL OR (connect_expires_at>accepted_at AND connect_expires_at<=accepted_at+INTERVAL '31 seconds'))),
 CONSTRAINT call_state_shape CHECK(
  (status='RINGING' AND accepted_at IS NULL AND ended_at IS NULL AND end_reason IS NULL) OR
  (status='CONNECTING' AND accepted_at IS NOT NULL AND ended_at IS NULL AND end_reason IS NULL) OR
  (status IN ('REJECTED','MISSED','FAILED','ENDED') AND ended_at IS NOT NULL AND end_reason IS NOT NULL
   AND end_reason IN ('DECLINED','RING_TIMEOUT','CONNECT_TIMEOUT','USER_ENDED','PARTICIPANT_UNAVAILABLE')))
);
CREATE INDEX call_sessions_caller_user_id_callee_user_id_created_at_idx ON call_sessions(caller_user_id,callee_user_id,created_at);
CREATE INDEX call_sessions_status_last_checked_at_idx ON call_sessions(status,last_checked_at);
CREATE TABLE active_call_participants (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,call_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE RESTRICT,
 side VARCHAR(6) NOT NULL CHECK(side IN ('CALLER','CALLEE')),
 CONSTRAINT active_call_participants_call_id_side_key UNIQUE(call_id,side)
);
CREATE TABLE call_events (
 id UUID PRIMARY KEY,call_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE RESTRICT,
 aggregate_version INTEGER NOT NULL CHECK(aggregate_version BETWEEN 1 AND 1000000),
 event_type VARCHAR(30) NOT NULL CHECK(event_type IN ('call.ringing','call.accepted','call.rejected','call.missed','call.failed','call.ended')),
 actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
 reason VARCHAR(40) CHECK(reason IN ('DECLINED','RING_TIMEOUT','CONNECT_TIMEOUT','USER_ENDED','PARTICIPANT_UNAVAILABLE')),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT call_events_call_id_aggregate_version_key UNIQUE(call_id,aggregate_version)
);
CREATE TABLE call_commands (
 actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,operation VARCHAR(10) NOT NULL CHECK(operation IN ('CREATE','ACCEPT','REJECT','END')),
 key UUID NOT NULL,fingerprint CHAR(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 call_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE RESTRICT,version INTEGER NOT NULL,status "CallStatus" NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(actor_user_id,operation,key),
 CONSTRAINT call_command_version FOREIGN KEY(call_id,version) REFERENCES call_events(call_id,aggregate_version) ON DELETE RESTRICT
);
CREATE FUNCTION guard_call_admission() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE n INTEGER;actual public."MobilityJobType";
BEGIN
 PERFORM pg_advisory_xact_lock(72111401);
 IF NEW.status<>'RINGING' OR NEW.version<>1 OR NEW.signal_epoch<>0 THEN RAISE EXCEPTION 'call must begin ringing' USING ERRCODE='23514';END IF;
 SELECT count(*) INTO n FROM public.call_sessions WHERE status IN ('RINGING','CONNECTING');
 IF n>=100 THEN RAISE EXCEPTION 'local call control capacity reached' USING ERRCODE='23514'; END IF;
 SELECT job_type INTO actual FROM public.mobility_jobs WHERE id=NEW.job_id;
 IF actual IS DISTINCT FROM NEW.job_type THEN RAISE EXCEPTION 'call job type mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_call_admission() FROM PUBLIC;
CREATE TRIGGER call_admission BEFORE INSERT ON call_sessions FOR EACH ROW EXECUTE FUNCTION guard_call_admission();
CREATE FUNCTION require_call_history_slots() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target UUID;r public.call_sessions%ROWTYPE;total BIGINT;latest INTEGER;slot_count INTEGER;last_type TEXT;
BEGIN
 IF TG_TABLE_NAME='call_sessions' THEN target:=NEW.id;
 ELSIF TG_OP='DELETE' THEN target:=OLD.call_id;ELSE target:=NEW.call_id;END IF;
 SELECT * INTO r FROM public.call_sessions WHERE id=target;
 SELECT count(*),max(aggregate_version) INTO total,latest FROM public.call_events WHERE call_id=target;
 IF total<>r.version OR latest IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'call history mismatch' USING ERRCODE='23514'; END IF;
 SELECT event_type INTO last_type FROM public.call_events WHERE call_id=target AND aggregate_version=r.version;
 IF last_type IS DISTINCT FROM CASE WHEN r.status='CONNECTING' THEN 'call.accepted' ELSE 'call.'||lower(r.status::TEXT) END
  THEN RAISE EXCEPTION 'call state event mismatch' USING ERRCODE='23514';END IF;
 SELECT count(*) INTO slot_count FROM public.active_call_participants WHERE call_id=target;
 IF r.status IN ('RINGING','CONNECTING') THEN
  IF slot_count<>2 OR NOT EXISTS(SELECT 1 FROM public.active_call_participants WHERE call_id=target AND side='CALLER' AND user_id=r.caller_user_id)
   OR NOT EXISTS(SELECT 1 FROM public.active_call_participants WHERE call_id=target AND side='CALLEE' AND user_id=r.callee_user_id)
   THEN RAISE EXCEPTION 'active call slot mismatch' USING ERRCODE='23514'; END IF;
 ELSIF slot_count<>0 THEN RAISE EXCEPTION 'terminal call retains slots' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION require_call_history_slots() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER call_state_history AFTER INSERT OR UPDATE ON call_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_call_history_slots();
CREATE CONSTRAINT TRIGGER call_event_history AFTER INSERT ON call_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_call_history_slots();
CREATE CONSTRAINT TRIGGER call_slot_consistency AFTER INSERT OR DELETE ON active_call_participants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_call_history_slots();
CREATE FUNCTION guard_call_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('REJECTED','MISSED','FAILED','ENDED') THEN RAISE EXCEPTION 'terminal call is immutable' USING ERRCODE='23514';END IF;
 IF NEW.version<OLD.version OR NEW.version>OLD.version+1
  OR (NEW.status<>OLD.status AND NEW.version<>OLD.version+1)
  OR (OLD.status='CONNECTING' AND NEW.status NOT IN ('CONNECTING','FAILED','ENDED'))
  OR (OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL AND NEW.status<>'CONNECTING')
  OR (OLD.accepted_at IS NOT NULL AND (NEW.callee_session_id IS DISTINCT FROM OLD.callee_session_id OR NEW.callee_device_id IS DISTINCT FROM OLD.callee_device_id
   OR NEW.callee_device_generation IS DISTINCT FROM OLD.callee_device_generation OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
   OR NEW.connect_expires_at IS DISTINCT FROM OLD.connect_expires_at OR NEW.signal_epoch<>OLD.signal_epoch))
  THEN RAISE EXCEPTION 'invalid call transition or device claim' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_call_transition() FROM PUBLIC;
CREATE TRIGGER call_transition BEFORE UPDATE ON call_sessions FOR EACH ROW EXECUTE FUNCTION guard_call_transition();
GRANT SELECT,INSERT ON call_sessions,active_call_participants,call_commands,call_events TO zipp_app;
GRANT UPDATE(callee_session_id,callee_device_id,callee_device_generation,status,version,signal_epoch,connect_expires_at,accepted_at,ended_at,end_reason,last_checked_at) ON call_sessions TO zipp_app;
GRANT DELETE ON active_call_participants TO zipp_app;
INSERT INTO platform_metadata(key,value) VALUES('calling','m7_4');
COMMIT;
