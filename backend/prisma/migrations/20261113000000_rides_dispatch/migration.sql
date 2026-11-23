-- Additive M5 ride/dispatch schema; target identification required.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- CreateEnum
CREATE TYPE "MobilityJobType" AS ENUM ('RIDE', 'DELIVERY');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('SEARCHING', 'ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_DRIVER');

-- CreateEnum
CREATE TYPE "RideOfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "fund_reservations" ADD COLUMN     "captured_amount_xaf" BIGINT;

-- CreateTable
CREATE TABLE "mobility_jobs" (
    "id" UUID NOT NULL,
    "job_type" "MobilityJobType" NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "mobility_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_job_assignments" (
    "driver_user_id" UUID NOT NULL,
    "mobility_job_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "active_job_assignments_pkey" PRIMARY KEY ("driver_user_id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "driver_user_id" UUID,
    "quote_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "service_area_id" UUID NOT NULL,
    "service_class" "ServiceClass" NOT NULL,
    "service_area_snapshot" JSONB NOT NULL,
    "status" "RideStatus" NOT NULL DEFAULT 'SEARCHING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "quoted_amount_xaf" BIGINT NOT NULL,
    "charged_amount_xaf" BIGINT NOT NULL DEFAULT 0,
    "commission_bps" INTEGER NOT NULL,
    "cancellation_fee_xaf" BIGINT NOT NULL,
    "pickup_latitude" DOUBLE PRECISION NOT NULL,
    "pickup_longitude" DOUBLE PRECISION NOT NULL,
    "destination_latitude" DOUBLE PRECISION NOT NULL,
    "destination_longitude" DOUBLE PRECISION NOT NULL,
    "distance_meters" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "pricing_policy_version" VARCHAR(80) NOT NULL,
    "search_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "dispatch_wave" INTEGER NOT NULL DEFAULT 0,
    "radius_meters" INTEGER NOT NULL DEFAULT 2000,
    "assigned_at" TIMESTAMPTZ(3),
    "arrived_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancellation_reason" VARCHAR(300),
    "completion_pin_hash" CHAR(64),
    "pin_expires_at" TIMESTAMPTZ(3),
    "pin_issued_at" TIMESTAMPTZ(3),
    "pin_issue_count" INTEGER NOT NULL DEFAULT 0,
    "pin_issue_window_ends_at" TIMESTAMPTZ(3),
    "pin_failure_count" INTEGER NOT NULL DEFAULT 0,
    "pin_failure_window_ends_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_requests" (
    "request_reason" VARCHAR(500),
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "request_key" UUID NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "ride_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_offers" (
    "id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "driver_user_id" UUID NOT NULL,
    "wave" INTEGER NOT NULL,
    "radius_meters" INTEGER NOT NULL,
    "status" "RideOfferStatus" NOT NULL DEFAULT 'OFFERED',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_events" (
    "id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "event_type" VARCHAR(80) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_dispatch_tasks" (
    "ride_id" UUID NOT NULL,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(3),
    "review_required" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "ride_dispatch_tasks_pkey" PRIMARY KEY ("ride_id")
);

-- CreateTable
CREATE TABLE "ride_ratings" (
    "ride_id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "driver_user_id" UUID NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_ratings_pkey" PRIMARY KEY ("ride_id")
);

-- CreateTable
CREATE TABLE "ride_disputes" (
    "ride_id" UUID NOT NULL,
    "opened_by_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "resolution" VARCHAR(30),
    "resolution_reason" VARCHAR(500),
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_disputes_pkey" PRIMARY KEY ("ride_id")
);

-- CreateIndex
CREATE INDEX "mobility_jobs_customer_user_id_closed_at_idx" ON "mobility_jobs"("customer_user_id", "closed_at");

-- CreateIndex
CREATE UNIQUE INDEX "active_job_assignments_mobility_job_id_key" ON "active_job_assignments"("mobility_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "rides_quote_id_key" ON "rides"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "rides_reservation_id_key" ON "rides"("reservation_id");

-- CreateIndex
CREATE INDEX "rides_customer_user_id_created_at_id_idx" ON "rides"("customer_user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "rides_driver_user_id_created_at_id_idx" ON "rides"("driver_user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "rides_status_search_expires_at_idx" ON "rides"("status", "search_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ride_requests_actor_user_id_action_request_key_key" ON "ride_requests"("actor_user_id", "action", "request_key");

-- CreateIndex
CREATE INDEX "ride_offers_driver_user_id_status_expires_at_idx" ON "ride_offers"("driver_user_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ride_offers_ride_id_driver_user_id_key" ON "ride_offers"("ride_id", "driver_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ride_events_ride_id_aggregate_version_key" ON "ride_events"("ride_id", "aggregate_version");

-- CreateIndex
CREATE INDEX "ride_dispatch_tasks_completed_at_review_required_available__idx" ON "ride_dispatch_tasks"("completed_at", "review_required", "available_at", "lease_expires_at");

-- CreateIndex
CREATE INDEX "ride_ratings_driver_user_id_created_at_idx" ON "ride_ratings"("driver_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "active_job_assignments" ADD CONSTRAINT "active_job_assignments_mobility_job_id_fkey" FOREIGN KEY ("mobility_job_id") REFERENCES "mobility_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_id_fkey" FOREIGN KEY ("id") REFERENCES "mobility_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_dispatch_tasks" ADD CONSTRAINT "ride_dispatch_tasks_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_ratings" ADD CONSTRAINT "ride_ratings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_disputes" ADD CONSTRAINT "ride_disputes_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill the meaning of pre-M5 full captures; posted history is not changed.
UPDATE fund_reservations SET captured_amount_xaf=amount_xaf WHERE status='CAPTURED';
ALTER TABLE fund_reservations ADD CONSTRAINT reservation_capture_bounds CHECK(captured_amount_xaf IS NULL OR captured_amount_xaf BETWEEN 1 AND amount_xaf);
ALTER TABLE fund_reservations ADD CONSTRAINT reservation_refund_capture_bounds CHECK(refunded_amount_xaf<=COALESCE(captured_amount_xaf,amount_xaf));
ALTER TABLE mobility_jobs ADD CONSTRAINT mobility_job_customer_fk FOREIGN KEY(customer_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE active_job_assignments ADD CONSTRAINT assignment_driver_fk FOREIGN KEY(driver_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE rides ADD CONSTRAINT ride_customer_fk FOREIGN KEY(customer_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE rides ADD CONSTRAINT ride_driver_fk FOREIGN KEY(driver_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE rides ADD CONSTRAINT ride_quote_fk FOREIGN KEY(quote_id) REFERENCES price_quotes(id) ON DELETE RESTRICT;
ALTER TABLE rides ADD CONSTRAINT ride_reservation_fk FOREIGN KEY(reservation_id) REFERENCES fund_reservations(id) ON DELETE RESTRICT;
ALTER TABLE rides ADD CONSTRAINT ride_service_area_fk FOREIGN KEY(service_area_id) REFERENCES service_areas(id) ON DELETE RESTRICT;
ALTER TABLE rides ADD CONSTRAINT ride_money_bounds CHECK(quoted_amount_xaf BETWEEN 1 AND 1000000000 AND charged_amount_xaf BETWEEN 0 AND quoted_amount_xaf AND commission_bps BETWEEN 0 AND 10000 AND cancellation_fee_xaf>=0);
ALTER TABLE rides ADD CONSTRAINT ride_state_timestamps CHECK((status IN ('COMPLETED','CANCELLED','NO_DRIVER'))=(completed_at IS NOT NULL));
ALTER TABLE rides ADD CONSTRAINT ride_driver_state CHECK((status NOT IN ('ASSIGNED','ARRIVED','IN_PROGRESS','COMPLETED') OR (driver_user_id IS NOT NULL AND assigned_at IS NOT NULL)) AND (driver_user_id IS NULL OR driver_user_id<>customer_user_id));
ALTER TABLE rides ADD CONSTRAINT ride_coordinate_bounds CHECK(pickup_latitude BETWEEN -90 AND 90 AND destination_latitude BETWEEN -90 AND 90 AND pickup_longitude BETWEEN -180 AND 180 AND destination_longitude BETWEEN -180 AND 180 AND distance_meters BETWEEN 1 AND 200000 AND duration_seconds BETWEEN 1 AND 43200);
ALTER TABLE rides ADD CONSTRAINT ride_pin_and_version_bounds CHECK(version>=1 AND dispatch_wave BETWEEN 0 AND 3 AND radius_meters IN (2000,5000,10000) AND pin_issue_count BETWEEN 0 AND 3 AND pin_failure_count BETWEEN 0 AND 5 AND (completion_pin_hash IS NULL OR completion_pin_hash ~ '^[a-f0-9]{64}$'));
CREATE UNIQUE INDEX ride_customer_single_active ON rides(customer_user_id) WHERE status IN ('SEARCHING','ASSIGNED','ARRIVED','IN_PROGRESS');
ALTER TABLE ride_requests ADD CONSTRAINT ride_request_actor_fk FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE ride_offers ADD CONSTRAINT ride_offer_driver_fk FOREIGN KEY(driver_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE ride_offers ADD CONSTRAINT ride_offer_budget CHECK(wave BETWEEN 1 AND 3 AND radius_meters IN (2000,5000,10000) AND expires_at>created_at);
CREATE UNIQUE INDEX ride_offer_single_accepted ON ride_offers(ride_id) WHERE status='ACCEPTED';
ALTER TABLE ride_events ADD CONSTRAINT ride_event_contract CHECK(aggregate_version>=1 AND schema_version=1 AND event_type ~ '^ride[.][a-z_]+$');
ALTER TABLE ride_dispatch_tasks ADD CONSTRAINT ride_task_lease CHECK(attempts>=0 AND ((lease_token IS NULL)=(lease_expires_at IS NULL)));
ALTER TABLE ride_ratings ADD CONSTRAINT ride_rating_stars CHECK(stars BETWEEN 1 AND 5);
ALTER TABLE ride_ratings ADD CONSTRAINT ride_rating_customer_fk FOREIGN KEY(customer_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE ride_ratings ADD CONSTRAINT ride_rating_driver_fk FOREIGN KEY(driver_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE ride_disputes ADD CONSTRAINT ride_dispute_opener_fk FOREIGN KEY(opened_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE ride_disputes ADD CONSTRAINT ride_dispute_resolver_fk FOREIGN KEY(resolved_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE ride_disputes ADD CONSTRAINT ride_dispute_resolution CHECK((resolution IS NULL AND resolved_by_id IS NULL AND resolved_at IS NULL) OR (resolution IN ('release','refund') AND resolved_by_id IS NOT NULL AND resolved_at IS NOT NULL AND length(btrim(resolution_reason)) BETWEEN 10 AND 500));
CREATE INDEX driver_presence_dispatch_bounds ON driver_presence(latitude,longitude,received_at) WHERE online;

-- Serialize even a direct assignment INSERT with job closure. Uniqueness separately protects drivers.
CREATE FUNCTION require_open_assignment_job() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE closed timestamptz;
BEGIN
 SELECT closed_at INTO closed FROM public.mobility_jobs WHERE id=NEW.mobility_job_id FOR UPDATE;
 IF NOT FOUND OR closed IS NOT NULL THEN RAISE EXCEPTION 'job is closed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION require_open_assignment_job() FROM PUBLIC;
CREATE TRIGGER assignment_open_job BEFORE INSERT ON active_job_assignments FOR EACH ROW EXECUTE FUNCTION require_open_assignment_job();

CREATE FUNCTION require_job_ride_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE job_id uuid; job_kind public."MobilityJobType"; closed timestamptz; job_customer uuid; state public."RideStatus"; ride_driver uuid; ride_customer uuid; assigned_driver uuid;
BEGIN
 IF TG_TABLE_NAME='active_job_assignments' THEN
   IF TG_OP='DELETE' THEN job_id:=OLD.mobility_job_id; ELSE job_id:=NEW.mobility_job_id; END IF;
 ELSE job_id:=NEW.id; END IF;
 SELECT j.job_type,j.closed_at,j.customer_user_id INTO job_kind,closed,job_customer FROM public.mobility_jobs j WHERE j.id=job_id;
 SELECT driver_user_id INTO assigned_driver FROM public.active_job_assignments WHERE mobility_job_id=job_id;
 IF closed IS NOT NULL AND assigned_driver IS NOT NULL THEN RAISE EXCEPTION 'closed job has assignment' USING ERRCODE='23514'; END IF;
 IF job_kind='RIDE' THEN
   SELECT status,driver_user_id,customer_user_id INTO state,ride_driver,ride_customer FROM public.rides WHERE id=job_id;
   IF NOT FOUND OR ride_customer IS DISTINCT FROM job_customer THEN RAISE EXCEPTION 'ride job identity mismatch' USING ERRCODE='23514'; END IF;
   IF state IN ('ASSIGNED','ARRIVED','IN_PROGRESS') THEN
     IF assigned_driver IS DISTINCT FROM ride_driver OR closed IS NOT NULL THEN RAISE EXCEPTION 'active ride assignment mismatch' USING ERRCODE='23514'; END IF;
   ELSE
     IF assigned_driver IS NOT NULL THEN RAISE EXCEPTION 'unassigned or terminal ride has assignment' USING ERRCODE='23514'; END IF;
     IF (state IN ('COMPLETED','CANCELLED','NO_DRIVER')) IS DISTINCT FROM (closed IS NOT NULL) THEN RAISE EXCEPTION 'ride closure mismatch' USING ERRCODE='23514'; END IF;
   END IF;
 ELSE
   IF EXISTS(SELECT 1 FROM public.rides WHERE id=job_id) THEN RAISE EXCEPTION 'ride must use a ride job' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION require_job_ride_assignment() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER mobility_job_assignment_consistency AFTER INSERT OR UPDATE ON mobility_jobs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_job_ride_assignment();
CREATE CONSTRAINT TRIGGER ride_assignment_consistency AFTER INSERT OR UPDATE ON rides DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_job_ride_assignment();
CREATE CONSTRAINT TRIGGER active_assignment_consistency AFTER INSERT OR DELETE ON active_job_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_job_ride_assignment();

CREATE FUNCTION require_ride_event_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target uuid; expected integer; latest integer; event_count bigint;
BEGIN
 IF TG_TABLE_NAME='rides' THEN target:=NEW.id; ELSE target:=NEW.ride_id; END IF;
 SELECT version INTO expected FROM public.rides WHERE id=target;
 SELECT max(aggregate_version),count(*) INTO latest,event_count FROM public.ride_events WHERE ride_id=target;
 IF latest IS DISTINCT FROM expected OR event_count<>expected THEN RAISE EXCEPTION 'ride event version mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION require_ride_event_version() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER ride_version_has_event AFTER INSERT OR UPDATE ON rides DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_ride_event_version();
CREATE CONSTRAINT TRIGGER ride_event_matches_version AFTER INSERT ON ride_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_ride_event_version();

GRANT SELECT,INSERT ON mobility_jobs,active_job_assignments,rides,ride_requests,ride_offers,ride_events,ride_dispatch_tasks,ride_ratings,ride_disputes TO zipp_app;
GRANT UPDATE(closed_at) ON mobility_jobs TO zipp_app;
GRANT DELETE ON active_job_assignments TO zipp_app;
GRANT UPDATE ON rides,ride_offers,ride_dispatch_tasks,ride_disputes TO zipp_app;
-- Posted events, request identities and ratings are append-only; no runtime history reset.
UPDATE platform_metadata SET value='m5' WHERE key='foundation';
COMMIT;
