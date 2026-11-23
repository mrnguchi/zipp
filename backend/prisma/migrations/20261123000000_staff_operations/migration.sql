-- Additive source only. No seed, balance mutation, job release or provider action.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE operations_cases (
 id UUID PRIMARY KEY, subject_type VARCHAR(10) NOT NULL CHECK(subject_type IN ('ACCOUNT','DRIVER','RIDE','DELIVERY','PAYMENT')),
 subject_id UUID NOT NULL, reason_code VARCHAR(30) NOT NULL CHECK(reason_code IN ('SAFETY_CONCERN','SERVICE_COMPLAINT','DUPLICATE_ACTIVITY','PAYMENT_MISMATCH','REVIEW_COMPLETED','INSUFFICIENT_EVIDENCE','OTHER')),
 description VARCHAR(2000) NOT NULL CHECK(length(description) BETWEEN 10 AND 2000),
 status VARCHAR(15) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 1000),
 opened_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX operations_cases_subject_type_status_id_idx ON operations_cases(subject_type,status,id);
CREATE INDEX operations_cases_subject_type_subject_id_idx ON operations_cases(subject_type,subject_id);
CREATE TABLE operations_case_events (
 id UUID PRIMARY KEY,case_id UUID NOT NULL REFERENCES operations_cases(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version BETWEEN 1 AND 1000),action VARCHAR(20) NOT NULL CHECK(action IN ('OPEN','REVIEW','ACCOUNT_STATUS')),
 status VARCHAR(15) NOT NULL CHECK(status IN ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')),
 reason_code VARCHAR(30) NOT NULL CHECK(reason_code IN ('SAFETY_CONCERN','SERVICE_COMPLAINT','DUPLICATE_ACTIVITY','PAYMENT_MISMATCH','REVIEW_COMPLETED','INSUFFICIENT_EVIDENCE','OTHER')),
 actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 account_status VARCHAR(10) CHECK(account_status IN ('ACTIVE','SUSPENDED')),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT operations_case_events_case_id_version_key UNIQUE(case_id,version),
 CONSTRAINT operations_event_action_shape CHECK((action='ACCOUNT_STATUS' AND account_status IS NOT NULL AND status='IN_REVIEW') OR (action<>'ACCOUNT_STATUS' AND account_status IS NULL))
);
CREATE TABLE operations_commands (
 actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,operation VARCHAR(20) NOT NULL CHECK(operation IN ('OPEN','REVIEW','ACCOUNT_STATUS')),
 key UUID NOT NULL,fingerprint CHAR(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 case_id UUID NOT NULL REFERENCES operations_cases(id) ON DELETE RESTRICT,version INTEGER NOT NULL,
 status VARCHAR(15) NOT NULL CHECK(status IN ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')),
 account_status VARCHAR(10) CHECK(account_status IN ('ACTIVE','SUSPENDED')),created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(actor_user_id,operation,key),CONSTRAINT operations_command_version FOREIGN KEY(case_id,version) REFERENCES operations_case_events(case_id,version) ON DELETE RESTRICT
);
CREATE FUNCTION guard_operations_case() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE found BOOLEAN;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 OR NEW.status<>'OPEN' THEN RAISE EXCEPTION 'case must begin open' USING ERRCODE='23514';END IF;
  CASE NEW.subject_type
   WHEN 'ACCOUNT' THEN SELECT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.subject_id) INTO found;
   WHEN 'DRIVER' THEN SELECT EXISTS(SELECT 1 FROM public.driver_applications WHERE id=NEW.subject_id) INTO found;
   WHEN 'RIDE' THEN SELECT EXISTS(SELECT 1 FROM public.rides WHERE id=NEW.subject_id) INTO found;
   WHEN 'DELIVERY' THEN SELECT EXISTS(SELECT 1 FROM public.deliveries WHERE id=NEW.subject_id) INTO found;
   WHEN 'PAYMENT' THEN SELECT EXISTS(SELECT 1 FROM public.financial_operations WHERE id=NEW.subject_id) INTO found;
  END CASE;
  IF NOT found THEN RAISE EXCEPTION 'case subject missing' USING ERRCODE='23503';END IF;
 ELSE
  IF NEW.version<>OLD.version+1 OR NOT (
   (OLD.status='OPEN' AND NEW.status IN ('IN_REVIEW','DISMISSED')) OR
   (OLD.status='IN_REVIEW' AND NEW.status IN ('IN_REVIEW','RESOLVED','DISMISSED')) OR
   (OLD.status IN ('RESOLVED','DISMISSED') AND NEW.status='IN_REVIEW'))
   THEN RAISE EXCEPTION 'invalid case transition' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_operations_case() FROM PUBLIC;
CREATE TRIGGER operations_case_guard BEFORE INSERT OR UPDATE ON operations_cases FOR EACH ROW EXECUTE FUNCTION guard_operations_case();
CREATE FUNCTION require_operations_case_history() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target UUID;r public.operations_cases%ROWTYPE;e public.operations_case_events%ROWTYPE;total BIGINT;latest INTEGER;previous_status TEXT;
BEGIN
 IF TG_TABLE_NAME='operations_cases' THEN target:=NEW.id;ELSE target:=NEW.case_id;END IF;
 SELECT * INTO r FROM public.operations_cases WHERE id=target;
 SELECT count(*),max(version) INTO total,latest FROM public.operations_case_events WHERE case_id=target;
 IF total<>r.version OR latest IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'case history mismatch' USING ERRCODE='23514';END IF;
 SELECT * INTO e FROM public.operations_case_events WHERE case_id=target AND version=r.version;
 IF e.status<>r.status OR (r.version=1 AND e.action<>'OPEN') OR (r.version>1 AND e.action='OPEN') OR (e.action='ACCOUNT_STATUS' AND r.subject_type<>'ACCOUNT')
  THEN RAISE EXCEPTION 'case event state mismatch' USING ERRCODE='23514';END IF;
 IF r.version>1 THEN
  SELECT status INTO previous_status FROM public.operations_case_events WHERE case_id=target AND version=r.version-1;
  IF (previous_status=e.status AND e.action<>'ACCOUNT_STATUS') OR (previous_status<>e.status AND e.action<>'REVIEW')
   THEN RAISE EXCEPTION 'case event action mismatch' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION require_operations_case_history() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER operations_case_history AFTER INSERT OR UPDATE ON operations_cases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_operations_case_history();
CREATE CONSTRAINT TRIGGER operations_event_history AFTER INSERT ON operations_case_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_operations_case_history();
CREATE FUNCTION guard_operations_command() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE e public.operations_case_events%ROWTYPE;
BEGIN
 SELECT * INTO e FROM public.operations_case_events WHERE case_id=NEW.case_id AND version=NEW.version;
 IF e.id IS NULL OR e.actor_user_id<>NEW.actor_user_id OR e.action<>NEW.operation OR e.status<>NEW.status OR e.account_status IS DISTINCT FROM NEW.account_status
  THEN RAISE EXCEPTION 'case command receipt mismatch' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_operations_command() FROM PUBLIC;
CREATE TRIGGER operations_command_guard BEFORE INSERT ON operations_commands FOR EACH ROW EXECUTE FUNCTION guard_operations_command();
GRANT SELECT,INSERT ON operations_cases,operations_case_events,operations_commands TO zipp_app;
GRANT UPDATE(status,version,updated_at) ON operations_cases TO zipp_app;
INSERT INTO platform_metadata(key,value) VALUES('operations','m7_5');
COMMIT;
