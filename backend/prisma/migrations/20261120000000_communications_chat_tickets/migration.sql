-- M7.2 source only: identify the target database before a separately requested apply.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TYPE "CommunicationKind" AS ENUM ('JOB','SUPPORT');
CREATE TYPE "CommunicationStatus" AS ENUM ('OPEN','RESOLVED');
CREATE TABLE communication_threads (
 id UUID PRIMARY KEY, kind "CommunicationKind" NOT NULL,
 creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 job_id UUID REFERENCES mobility_jobs(id) ON DELETE RESTRICT, job_type "MobilityJobType",
 subject VARCHAR(120), category VARCHAR(20), status "CommunicationStatus" NOT NULL DEFAULT 'OPEN',
 version INTEGER NOT NULL DEFAULT 1, last_sequence INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT communication_thread_bounds CHECK(version BETWEEN 1 AND 1000000 AND last_sequence BETWEEN 0 AND 2000),
 CONSTRAINT communication_thread_job_pair CHECK((job_id IS NULL)=(job_type IS NULL)),
 CONSTRAINT communication_thread_shape CHECK(
  (kind='JOB' AND job_id IS NOT NULL AND subject IS NULL AND category IS NULL AND status='OPEN') OR
  (kind='SUPPORT' AND length(btrim(subject)) BETWEEN 3 AND 120 AND subject IS NOT NULL
   AND subject !~ '[[:cntrl:]]' AND category IS NOT NULL
   AND category IN ('ACCOUNT','RIDE','DELIVERY','PAYMENT','SAFETY','OTHER')))
);
-- SUPPORT context is not unique: different tickets may concern the same job.
CREATE UNIQUE INDEX communication_one_job_thread ON communication_threads(job_id) WHERE kind='JOB';
CREATE INDEX communication_threads_creator_user_id_kind_status_id_idx ON communication_threads(creator_user_id,kind,status,id);
CREATE INDEX communication_threads_kind_status_id_idx ON communication_threads(kind,status,id);
CREATE INDEX communication_threads_job_id_kind_idx ON communication_threads(job_id,kind);
CREATE TABLE communication_messages (
 id UUID PRIMARY KEY, thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE RESTRICT,
 sequence INTEGER NOT NULL CHECK(sequence BETWEEN 1 AND 2000),
 author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 body TEXT NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 2000 AND octet_length(body)<=8000
  AND translate(body,chr(9)||chr(10)||chr(13),'') !~ '[[:cntrl:]]'),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT communication_messages_thread_id_sequence_key UNIQUE(thread_id,sequence),
 CONSTRAINT communication_messages_thread_id_id_key UNIQUE(thread_id,id),
 CONSTRAINT communication_message_receipt_reference UNIQUE(thread_id,id,sequence)
);
CREATE TABLE communication_read_cursors (
 thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE RESTRICT,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 sequence INTEGER NOT NULL DEFAULT 0 CHECK(sequence BETWEEN 0 AND 2000),
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(thread_id,user_id)
);
CREATE TABLE communication_commands (
 actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 operation VARCHAR(30) NOT NULL CHECK(operation IN ('ticket.create','message.send','ticket.status')),
 key UUID NOT NULL, fingerprint CHAR(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE RESTRICT,
 message_id UUID, sequence INTEGER, version INTEGER NOT NULL CHECK(version BETWEEN 1 AND 1000000),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(actor_user_id,operation,key),
 CONSTRAINT communication_command_message FOREIGN KEY(thread_id,message_id,sequence)
  REFERENCES communication_messages(thread_id,id,sequence) ON DELETE RESTRICT,
 CONSTRAINT communication_command_shape CHECK(
  (operation='ticket.status' AND message_id IS NULL AND sequence IS NULL) OR
  (operation IN ('ticket.create','message.send') AND message_id IS NOT NULL AND sequence IS NOT NULL AND sequence BETWEEN 1 AND 2000))
);
CREATE INDEX communication_commands_thread_id_idx ON communication_commands(thread_id);
CREATE TABLE communication_events (
 id UUID PRIMARY KEY, thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE RESTRICT,
 aggregate_version INTEGER NOT NULL CHECK(aggregate_version BETWEEN 1 AND 1000000),
 event_type VARCHAR(40) NOT NULL CHECK(event_type IN ('conversation.opened','ticket.opened','message.sent','ticket.reopened','ticket.resolved')),
 actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 message_sequence INTEGER, reason VARCHAR(30), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT communication_events_thread_id_aggregate_version_key UNIQUE(thread_id,aggregate_version),
 CONSTRAINT communication_event_message FOREIGN KEY(thread_id,message_sequence)
  REFERENCES communication_messages(thread_id,sequence) ON DELETE RESTRICT,
 CONSTRAINT communication_event_shape CHECK(
  (event_type='conversation.opened' AND message_sequence IS NULL AND reason IS NULL) OR
  (event_type IN ('ticket.opened','message.sent') AND message_sequence IS NOT NULL AND reason IS NULL) OR
  (event_type IN ('ticket.reopened','ticket.resolved') AND message_sequence IS NULL
   AND reason IS NOT NULL AND reason IN ('CUSTOMER_REQUEST','ANSWERED','DUPLICATE','FOLLOW_UP','OTHER')))
);
ALTER TABLE communication_commands ADD CONSTRAINT communication_command_event
 FOREIGN KEY(thread_id,version) REFERENCES communication_events(thread_id,aggregate_version) ON DELETE RESTRICT;
-- Deferred consistency allows one transaction to allocate sequence, append message,
-- receipt and event in any local order; a partial accepted mutation cannot commit.
CREATE FUNCTION require_communication_history() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target UUID; expected INTEGER; last_seq INTEGER; latest INTEGER; total BIGINT; job_kind public."MobilityJobType";
BEGIN
 IF TG_TABLE_NAME='communication_threads' THEN target:=NEW.id; ELSE target:=NEW.thread_id; END IF;
 SELECT version,last_sequence INTO expected,last_seq FROM public.communication_threads WHERE id=target;
 SELECT max(aggregate_version),count(*) INTO latest,total FROM public.communication_events WHERE thread_id=target;
 IF latest IS DISTINCT FROM expected OR total<>expected THEN RAISE EXCEPTION 'communication event version mismatch' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(max(sequence),0),count(*) INTO latest,total FROM public.communication_messages WHERE thread_id=target;
 IF latest<>last_seq OR total<>last_seq THEN RAISE EXCEPTION 'communication sequence mismatch' USING ERRCODE='23514'; END IF;
 SELECT j.job_type INTO job_kind FROM public.mobility_jobs j JOIN public.communication_threads t ON t.job_id=j.id WHERE t.id=target;
 IF job_kind IS DISTINCT FROM (SELECT job_type FROM public.communication_threads WHERE id=target) THEN RAISE EXCEPTION 'communication job type mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION require_communication_history() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER communication_thread_history AFTER INSERT OR UPDATE ON communication_threads DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_communication_history();
CREATE CONSTRAINT TRIGGER communication_event_history AFTER INSERT ON communication_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_communication_history();
CREATE CONSTRAINT TRIGGER communication_message_history AFTER INSERT ON communication_messages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_communication_history();
CREATE FUNCTION guard_communication_cursor() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE latest INTEGER;
BEGIN
 SELECT last_sequence INTO latest FROM public.communication_threads WHERE id=NEW.thread_id FOR UPDATE;
 IF NEW.sequence>latest OR (TG_OP='UPDATE' AND NEW.sequence<OLD.sequence) THEN RAISE EXCEPTION 'invalid communication cursor' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_communication_cursor() FROM PUBLIC;
CREATE TRIGGER communication_cursor_monotonic BEFORE INSERT OR UPDATE ON communication_read_cursors FOR EACH ROW EXECUTE FUNCTION guard_communication_cursor();
GRANT SELECT,INSERT ON communication_threads,communication_messages,communication_read_cursors,communication_commands,communication_events TO zipp_app;
GRANT UPDATE(status,version,last_sequence,updated_at) ON communication_threads TO zipp_app;
GRANT UPDATE(sequence,updated_at) ON communication_read_cursors TO zipp_app;
-- No message/receipt/event update or delete privileges and no content purge in M7.2.
INSERT INTO platform_metadata(key,value) VALUES('communications','m7_2');
COMMIT;
