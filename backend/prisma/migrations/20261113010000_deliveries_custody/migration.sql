BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SEARCHING', 'ASSIGNED', 'AT_PICKUP', 'COLLECTED', 'IN_TRANSIT', 'AT_DESTINATION', 'RETURNING', 'AT_RETURN', 'DELIVERED', 'RETURNED', 'CANCELLED', 'NO_COURIER');

-- CreateEnum
CREATE TYPE "PackageCustody" AS ENUM ('WITH_SENDER', 'WITH_COURIER', 'WITH_RECIPIENT', 'RETURNED_TO_SENDER');

-- CreateEnum
CREATE TYPE "DeliveryProofPurpose" AS ENUM ('PICKUP', 'HANDOVER', 'RETURN');

-- CreateEnum
CREATE TYPE "DeliveryOfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "booker_user_id" UUID NOT NULL,
    "sender_user_id" UUID,
    "recipient_user_id" UUID,
    "courier_user_id" UUID,
    "perspective" VARCHAR(12) NOT NULL,
    "sender_name" VARCHAR(100) NOT NULL,
    "sender_phone" VARCHAR(16) NOT NULL,
    "recipient_name" VARCHAR(100) NOT NULL,
    "recipient_phone" VARCHAR(16) NOT NULL,
    "package_description" VARCHAR(300) NOT NULL,
    "package_size" VARCHAR(10) NOT NULL,
    "package_weight_grams" INTEGER NOT NULL,
    "package_photo_id" UUID NOT NULL,
    "contact_sharing_consent" BOOLEAN NOT NULL,
    "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "quote_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "service_area_id" UUID NOT NULL,
    "service_area_snapshot" JSONB NOT NULL,
    "service_class" "ServiceClass" NOT NULL,
    "quoted_amount_xaf" BIGINT NOT NULL,
    "charged_amount_xaf" BIGINT NOT NULL DEFAULT 0,
    "refunded_amount_xaf" BIGINT NOT NULL DEFAULT 0,
    "commission_bps" INTEGER NOT NULL,
    "cancellation_fee_xaf" BIGINT NOT NULL,
    "pricing_policy_version" VARCHAR(80) NOT NULL,
    "pickup_latitude" DOUBLE PRECISION NOT NULL,
    "pickup_longitude" DOUBLE PRECISION NOT NULL,
    "destination_latitude" DOUBLE PRECISION NOT NULL,
    "destination_longitude" DOUBLE PRECISION NOT NULL,
    "distance_meters" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'SEARCHING',
    "custody" "PackageCustody" NOT NULL DEFAULT 'WITH_SENDER',
    "version" INTEGER NOT NULL DEFAULT 1,
    "dispatch_wave" INTEGER NOT NULL DEFAULT 0,
    "radius_meters" INTEGER NOT NULL DEFAULT 2000,
    "search_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "assigned_at" TIMESTAMPTZ(3),
    "collected_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancellation_reason" VARCHAR(300),
    "return_settlement" VARCHAR(24),
    "return_authorized_by_id" UUID,
    "return_authorization_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_package_photos" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING_UPLOAD',
    "object_key" UUID NOT NULL,
    "content_type" VARCHAR(40) NOT NULL,
    "byte_length" INTEGER NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "upload_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_package_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_requests" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "request_key" UUID NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "request_reason" VARCHAR(500),
    "delivery_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_offers" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "courier_user_id" UUID NOT NULL,
    "wave" INTEGER NOT NULL,
    "radius_meters" INTEGER NOT NULL,
    "status" "DeliveryOfferStatus" NOT NULL DEFAULT 'OFFERED',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_events" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "event_type" VARCHAR(80) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_dispatch_tasks" (
    "delivery_id" UUID NOT NULL,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(3),
    "review_required" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "delivery_dispatch_tasks_pkey" PRIMARY KEY ("delivery_id")
);

-- CreateTable
CREATE TABLE "delivery_proofs" (
    "delivery_id" UUID NOT NULL,
    "purpose" "DeliveryProofPurpose" NOT NULL,
    "request_id" UUID,
    "code_hash" CHAR(64),
    "expires_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "issued_at" TIMESTAMPTZ(3),
    "issue_count" INTEGER NOT NULL DEFAULT 0,
    "issue_window_ends_at" TIMESTAMPTZ(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "failure_window_ends_at" TIMESTAMPTZ(3),

    CONSTRAINT "delivery_proofs_pkey" PRIMARY KEY ("delivery_id","purpose")
);

-- CreateTable
CREATE TABLE "delivery_issues" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "opened_by_id" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "resolution" VARCHAR(30),
    "resolution_reason" VARCHAR(500),
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_ratings" (
    "delivery_id" UUID NOT NULL,
    "booker_user_id" UUID NOT NULL,
    "courier_user_id" UUID NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_ratings_pkey" PRIMARY KEY ("delivery_id")
);

-- CreateTable
CREATE TABLE "delivery_tracking_capabilities" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "issued_by_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_tracking_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_package_photo_id_key" ON "deliveries"("package_photo_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_quote_id_key" ON "deliveries"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_reservation_id_key" ON "deliveries"("reservation_id");

-- CreateIndex
CREATE INDEX "deliveries_booker_user_id_created_at_id_idx" ON "deliveries"("booker_user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "deliveries_sender_user_id_created_at_id_idx" ON "deliveries"("sender_user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "deliveries_recipient_user_id_created_at_id_idx" ON "deliveries"("recipient_user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "deliveries_courier_user_id_created_at_id_idx" ON "deliveries"("courier_user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "deliveries_status_search_expires_at_idx" ON "deliveries"("status", "search_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_package_photos_object_key_key" ON "delivery_package_photos"("object_key");

-- CreateIndex
CREATE INDEX "delivery_package_photos_owner_user_id_created_at_idx" ON "delivery_package_photos"("owner_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_requests_actor_user_id_action_request_key_key" ON "delivery_requests"("actor_user_id", "action", "request_key");

-- CreateIndex
CREATE INDEX "delivery_offers_courier_user_id_status_expires_at_idx" ON "delivery_offers"("courier_user_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_offers_delivery_id_courier_user_id_key" ON "delivery_offers"("delivery_id", "courier_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_events_delivery_id_aggregate_version_key" ON "delivery_events"("delivery_id", "aggregate_version");

-- CreateIndex
CREATE INDEX "delivery_dispatch_tasks_completed_at_review_required_availa_idx" ON "delivery_dispatch_tasks"("completed_at", "review_required", "available_at", "lease_expires_at");

-- CreateIndex
CREATE INDEX "delivery_issues_delivery_id_created_at_idx" ON "delivery_issues"("delivery_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_tracking_capabilities_token_hash_key" ON "delivery_tracking_capabilities"("token_hash");

-- CreateIndex
CREATE INDEX "delivery_tracking_capabilities_delivery_id_created_at_idx" ON "delivery_tracking_capabilities"("delivery_id", "created_at");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_id_fkey" FOREIGN KEY ("id") REFERENCES "mobility_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_package_photo_id_fkey" FOREIGN KEY ("package_photo_id") REFERENCES "delivery_package_photos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_requests" ADD CONSTRAINT "delivery_requests_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_dispatch_tasks" ADD CONSTRAINT "delivery_dispatch_tasks_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_issues" ADD CONSTRAINT "delivery_issues_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_ratings" ADD CONSTRAINT "delivery_ratings_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_tracking_capabilities" ADD CONSTRAINT "delivery_tracking_capabilities_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reviewed PostgreSQL guards and least-privilege runtime grants. No destructive reset.
ALTER TABLE deliveries ADD CONSTRAINT delivery_booker_fk FOREIGN KEY(booker_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE deliveries ADD CONSTRAINT delivery_sender_fk FOREIGN KEY(sender_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE deliveries ADD CONSTRAINT delivery_recipient_fk FOREIGN KEY(recipient_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE deliveries ADD CONSTRAINT delivery_courier_fk FOREIGN KEY(courier_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE deliveries ADD CONSTRAINT delivery_return_authorizer_fk FOREIGN KEY(return_authorized_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE deliveries ADD CONSTRAINT delivery_quote_fk FOREIGN KEY(quote_id) REFERENCES price_quotes(id) ON DELETE RESTRICT;
ALTER TABLE deliveries ADD CONSTRAINT delivery_reservation_fk FOREIGN KEY(reservation_id) REFERENCES fund_reservations(id) ON DELETE RESTRICT;
ALTER TABLE deliveries ADD CONSTRAINT delivery_area_fk FOREIGN KEY(service_area_id) REFERENCES service_areas(id) ON DELETE RESTRICT;
ALTER TABLE deliveries ADD CONSTRAINT delivery_contact_contract CHECK(perspective IN ('SENDING','RECEIVING') AND sender_phone ~ '^[+][1-9][0-9]{7,14}$' AND recipient_phone ~ '^[+][1-9][0-9]{7,14}$' AND length(btrim(sender_name)) BETWEEN 1 AND 100 AND length(btrim(recipient_name)) BETWEEN 1 AND 100 AND contact_sharing_consent AND ((perspective='SENDING' AND sender_user_id IS NOT NULL AND sender_user_id=booker_user_id) OR (perspective='RECEIVING' AND recipient_user_id IS NOT NULL AND recipient_user_id=booker_user_id)));
ALTER TABLE deliveries ADD CONSTRAINT delivery_package_bounds CHECK(length(btrim(package_description)) BETWEEN 3 AND 300 AND package_weight_grams>=1 AND ((package_size='SMALL' AND package_weight_grams<=2000) OR (package_size='MEDIUM' AND package_weight_grams<=10000) OR (package_size='LARGE' AND package_weight_grams<=20000)));
ALTER TABLE deliveries ADD CONSTRAINT delivery_money_bounds CHECK(service_class IN ('DELIVERY_STANDARD','DELIVERY_EXPRESS') AND quoted_amount_xaf BETWEEN 1 AND 1000000000 AND charged_amount_xaf BETWEEN 0 AND quoted_amount_xaf AND refunded_amount_xaf BETWEEN 0 AND charged_amount_xaf AND commission_bps BETWEEN 0 AND 10000 AND cancellation_fee_xaf>=0);
ALTER TABLE deliveries ADD CONSTRAINT delivery_terminal_timestamp CHECK((status IN ('DELIVERED','RETURNED','CANCELLED','NO_COURIER'))=(completed_at IS NOT NULL));
ALTER TABLE deliveries ADD CONSTRAINT delivery_custody_contract CHECK((status IN ('SEARCHING','ASSIGNED','AT_PICKUP','CANCELLED','NO_COURIER') AND custody='WITH_SENDER' AND collected_at IS NULL) OR (status IN ('COLLECTED','IN_TRANSIT','AT_DESTINATION','RETURNING','AT_RETURN') AND custody='WITH_COURIER' AND collected_at IS NOT NULL) OR (status='DELIVERED' AND custody='WITH_RECIPIENT' AND collected_at IS NOT NULL) OR (status='RETURNED' AND custody='RETURNED_TO_SENDER' AND collected_at IS NOT NULL));
ALTER TABLE deliveries ADD CONSTRAINT delivery_courier_contract CHECK((status IN ('SEARCHING','NO_COURIER') OR status='CANCELLED' OR (courier_user_id IS NOT NULL AND assigned_at IS NOT NULL)) AND (courier_user_id IS NULL OR (courier_user_id<>booker_user_id AND courier_user_id IS DISTINCT FROM sender_user_id AND courier_user_id IS DISTINCT FROM recipient_user_id)));
ALTER TABLE deliveries ADD CONSTRAINT delivery_return_contract CHECK((return_settlement IS NULL AND return_authorized_by_id IS NULL AND return_authorization_reason IS NULL AND status NOT IN ('RETURNING','AT_RETURN','RETURNED')) OR (return_settlement IN ('RELEASE_HOLD','CAPTURE_ORIGINAL') AND return_authorized_by_id IS NOT NULL AND return_authorized_by_id<>booker_user_id AND return_authorized_by_id IS DISTINCT FROM sender_user_id AND return_authorized_by_id IS DISTINCT FROM recipient_user_id AND return_authorized_by_id IS DISTINCT FROM courier_user_id AND length(btrim(return_authorization_reason)) BETWEEN 10 AND 500));
ALTER TABLE deliveries ADD CONSTRAINT delivery_coordinate_bounds CHECK(pickup_latitude BETWEEN -90 AND 90 AND destination_latitude BETWEEN -90 AND 90 AND pickup_longitude BETWEEN -180 AND 180 AND destination_longitude BETWEEN -180 AND 180 AND distance_meters BETWEEN 1 AND 200000 AND duration_seconds BETWEEN 1 AND 43200);
ALTER TABLE deliveries ADD CONSTRAINT delivery_version_budget CHECK(version>=1 AND dispatch_wave BETWEEN 0 AND 3 AND radius_meters IN (2000,5000,10000));
ALTER TABLE delivery_package_photos ADD CONSTRAINT delivery_photo_owner_fk FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE delivery_package_photos ADD CONSTRAINT delivery_photo_contract CHECK(status IN ('PENDING_UPLOAD','STORED') AND content_type IN ('image/jpeg','image/png') AND byte_length BETWEEN 16 AND 3145728 AND content_sha256 ~ '^[a-f0-9]{64}$' AND upload_expires_at>created_at);
ALTER TABLE delivery_requests ADD CONSTRAINT delivery_request_actor_fk FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE delivery_requests ADD CONSTRAINT delivery_request_digest CHECK(request_fingerprint ~ '^[a-f0-9]{64}$');
ALTER TABLE delivery_offers ADD CONSTRAINT delivery_offer_courier_fk FOREIGN KEY(courier_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE delivery_offers ADD CONSTRAINT delivery_offer_budget CHECK(wave BETWEEN 1 AND 3 AND radius_meters IN (2000,5000,10000) AND expires_at>created_at);
CREATE UNIQUE INDEX delivery_single_accepted_offer ON delivery_offers(delivery_id) WHERE status='ACCEPTED';
ALTER TABLE delivery_events ADD CONSTRAINT delivery_event_contract CHECK(aggregate_version>=1 AND schema_version=1 AND event_type ~ '^delivery[.][a-z_]+$');
ALTER TABLE delivery_dispatch_tasks ADD CONSTRAINT delivery_task_lease CHECK(attempts>=0 AND ((lease_token IS NULL)=(lease_expires_at IS NULL)));
ALTER TABLE delivery_proofs ADD CONSTRAINT delivery_proof_budget CHECK(issue_count BETWEEN 0 AND 3 AND failure_count BETWEEN 0 AND 5 AND (code_hash IS NULL OR (code_hash ~ '^[a-f0-9]{64}$' AND request_id IS NOT NULL AND expires_at IS NOT NULL AND consumed_at IS NULL)));
ALTER TABLE delivery_issues ADD CONSTRAINT delivery_issue_opener_fk FOREIGN KEY(opened_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE delivery_issues ADD CONSTRAINT delivery_issue_resolver_fk FOREIGN KEY(resolved_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE delivery_issues ADD CONSTRAINT delivery_issue_contract CHECK(kind IN ('RECIPIENT_UNREACHABLE','RETURN_REQUEST','DISPUTE') AND length(btrim(reason)) BETWEEN 10 AND 500 AND ((resolution IS NULL AND resolved_by_id IS NULL AND resolved_at IS NULL) OR (resolution IN ('RETURN_AUTHORIZED','REFUNDED') AND resolved_by_id IS NOT NULL AND resolved_at IS NOT NULL AND length(btrim(resolution_reason)) BETWEEN 10 AND 500)));
ALTER TABLE delivery_ratings ADD CONSTRAINT delivery_rating_stars CHECK(stars BETWEEN 1 AND 5);
ALTER TABLE delivery_ratings ADD CONSTRAINT delivery_rating_booker_fk FOREIGN KEY(booker_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE delivery_ratings ADD CONSTRAINT delivery_rating_courier_fk FOREIGN KEY(courier_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE delivery_tracking_capabilities ADD CONSTRAINT delivery_tracking_issuer_fk FOREIGN KEY(issued_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE delivery_tracking_capabilities ADD CONSTRAINT delivery_tracking_contract CHECK(token_hash ~ '^[a-f0-9]{64}$' AND expires_at>=created_at+interval '599 seconds' AND expires_at<=created_at+interval '24 hours');

-- Forward-only custody. Contact binding is permitted once without rewriting history.
CREATE FUNCTION require_delivery_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'delivery version must advance once' USING ERRCODE='23514'; END IF;
 IF (OLD.sender_user_id IS NOT NULL AND NEW.sender_user_id IS DISTINCT FROM OLD.sender_user_id) OR (OLD.recipient_user_id IS NOT NULL AND NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id) THEN RAISE EXCEPTION 'contact binding is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.courier_user_id IS NOT NULL AND NEW.courier_user_id IS DISTINCT FROM OLD.courier_user_id THEN RAISE EXCEPTION 'custodian is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.status<>OLD.status AND NOT (
  (OLD.status='SEARCHING' AND NEW.status IN ('ASSIGNED','CANCELLED','NO_COURIER')) OR
  (OLD.status='ASSIGNED' AND NEW.status IN ('AT_PICKUP','CANCELLED')) OR
  (OLD.status='AT_PICKUP' AND NEW.status IN ('COLLECTED','CANCELLED')) OR
  (OLD.status='COLLECTED' AND NEW.status IN ('IN_TRANSIT','RETURNING')) OR
  (OLD.status='IN_TRANSIT' AND NEW.status IN ('AT_DESTINATION','RETURNING')) OR
  (OLD.status='AT_DESTINATION' AND NEW.status IN ('DELIVERED','RETURNING')) OR
  (OLD.status='RETURNING' AND NEW.status='AT_RETURN') OR
  (OLD.status='AT_RETURN' AND NEW.status='RETURNED')) THEN RAISE EXCEPTION 'invalid delivery transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION require_delivery_transition() FROM PUBLIC;
CREATE TRIGGER delivery_forward_transition BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION require_delivery_transition();

CREATE FUNCTION require_delivery_event_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target uuid; expected integer; latest integer; event_count bigint;
BEGIN
 IF TG_TABLE_NAME='deliveries' THEN target:=NEW.id; ELSE target:=NEW.delivery_id; END IF;
 SELECT version INTO expected FROM public.deliveries WHERE id=target;
 SELECT max(aggregate_version),count(*) INTO latest,event_count FROM public.delivery_events WHERE delivery_id=target;
 IF latest IS DISTINCT FROM expected OR event_count<>expected THEN RAISE EXCEPTION 'delivery event version mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION require_delivery_event_version() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER delivery_version_has_event AFTER INSERT OR UPDATE ON deliveries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_delivery_event_version();
CREATE CONSTRAINT TRIGGER delivery_event_matches_version AFTER INSERT ON delivery_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_delivery_event_version();

CREATE FUNCTION require_delivery_custody_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE d public.deliveries; r public.fund_reservations; target uuid;
BEGIN
 IF TG_TABLE_NAME='deliveries' THEN target:=NEW.id; ELSE target:=NEW.delivery_id; END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=target;
 IF NOT EXISTS(SELECT 1 FROM public.mobility_jobs WHERE id=target AND job_type='DELIVERY') THEN RAISE EXCEPTION 'delivery job type required' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.delivery_package_photos WHERE id=d.package_photo_id AND owner_user_id=d.booker_user_id AND status='STORED') THEN RAISE EXCEPTION 'owned stored photo required' USING ERRCODE='23514'; END IF;
 SELECT * INTO r FROM public.fund_reservations WHERE id=d.reservation_id;
 IF r.amount_xaf<>d.quoted_amount_xaf OR r.business_key<>('delivery:'||target::text) OR NOT EXISTS(SELECT 1 FROM public.wallet_accounts WHERE id=r.wallet_account_id AND owner_user_id=d.booker_user_id) THEN RAISE EXCEPTION 'delivery hold identity mismatch' USING ERRCODE='23514'; END IF;
 IF d.collected_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.delivery_proofs WHERE delivery_id=target AND purpose='PICKUP' AND consumed_at IS NOT NULL) THEN RAISE EXCEPTION 'collection proof required' USING ERRCODE='23514'; END IF;
 IF d.status='DELIVERED' AND NOT EXISTS(SELECT 1 FROM public.delivery_proofs WHERE delivery_id=target AND purpose='HANDOVER' AND consumed_at IS NOT NULL) THEN RAISE EXCEPTION 'handover proof required' USING ERRCODE='23514'; END IF;
 IF d.status='RETURNED' AND NOT EXISTS(SELECT 1 FROM public.delivery_proofs WHERE delivery_id=target AND purpose='RETURN' AND consumed_at IS NOT NULL) THEN RAISE EXCEPTION 'sender return proof required' USING ERRCODE='23514'; END IF;
 IF d.completed_at IS NULL AND (r.status<>'RESERVED' OR d.charged_amount_xaf<>0 OR d.refunded_amount_xaf<>0) THEN RAISE EXCEPTION 'active delivery must retain its hold' USING ERRCODE='23514'; END IF;
 IF d.completed_at IS NOT NULL AND ((d.charged_amount_xaf=0 AND r.status<>'RELEASED') OR (d.charged_amount_xaf>0 AND (r.status<>'CAPTURED' OR r.captured_amount_xaf IS DISTINCT FROM d.charged_amount_xaf OR r.refunded_amount_xaf<>d.refunded_amount_xaf))) THEN RAISE EXCEPTION 'delivery settlement mismatch' USING ERRCODE='23514'; END IF;
 IF d.status='DELIVERED' AND d.charged_amount_xaf<>d.quoted_amount_xaf THEN RAISE EXCEPTION 'original fare capture required' USING ERRCODE='23514'; END IF;
 IF d.status='RETURNED' AND ((d.return_settlement='RELEASE_HOLD' AND d.charged_amount_xaf<>0) OR (d.return_settlement='CAPTURE_ORIGINAL' AND d.charged_amount_xaf<>d.quoted_amount_xaf)) THEN RAISE EXCEPTION 'authorized return settlement required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION require_delivery_custody_settlement() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER delivery_custody_settlement AFTER INSERT OR UPDATE ON deliveries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_delivery_custody_settlement();
CREATE CONSTRAINT TRIGGER delivery_proof_custody_consistency AFTER INSERT OR UPDATE ON delivery_proofs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_delivery_custody_settlement();

GRANT SELECT,INSERT ON deliveries,delivery_package_photos,delivery_requests,delivery_offers,delivery_events,delivery_dispatch_tasks,delivery_proofs,delivery_issues,delivery_ratings,delivery_tracking_capabilities TO zipp_app;
GRANT UPDATE(sender_user_id,recipient_user_id,courier_user_id,status,custody,version,charged_amount_xaf,refunded_amount_xaf,dispatch_wave,radius_meters,assigned_at,collected_at,completed_at,cancellation_reason,return_settlement,return_authorized_by_id,return_authorization_reason) ON deliveries TO zipp_app;
GRANT UPDATE(status) ON delivery_package_photos TO zipp_app;
GRANT UPDATE(status) ON delivery_offers TO zipp_app;
GRANT UPDATE ON delivery_dispatch_tasks,delivery_proofs TO zipp_app;
GRANT UPDATE(resolution,resolution_reason,resolved_by_id,resolved_at) ON delivery_issues TO zipp_app;
GRANT UPDATE(revoked_at) ON delivery_tracking_capabilities TO zipp_app;
-- History, rating and request identity rows are append-only for the application role.

CREATE OR REPLACE FUNCTION require_job_ride_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE job_id uuid; job_kind public."MobilityJobType"; closed timestamptz; job_customer uuid; state public."RideStatus"; ride_driver uuid; ride_customer uuid; assigned_driver uuid; delivery_state public."DeliveryStatus"; delivery_courier uuid; delivery_booker uuid;
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
   SELECT status,courier_user_id,booker_user_id INTO delivery_state,delivery_courier,delivery_booker FROM public.deliveries WHERE id=job_id;
   IF NOT FOUND OR delivery_booker IS DISTINCT FROM job_customer THEN RAISE EXCEPTION 'delivery job identity mismatch' USING ERRCODE='23514'; END IF;
   IF delivery_state IN ('ASSIGNED','AT_PICKUP','COLLECTED','IN_TRANSIT','AT_DESTINATION','RETURNING','AT_RETURN') THEN
     IF assigned_driver IS DISTINCT FROM delivery_courier OR closed IS NOT NULL THEN RAISE EXCEPTION 'delivery assignment mismatch' USING ERRCODE='23514'; END IF;
   ELSE
     IF assigned_driver IS NOT NULL OR ((delivery_state IN ('DELIVERED','RETURNED','CANCELLED','NO_COURIER')) IS DISTINCT FROM (closed IS NOT NULL)) THEN RAISE EXCEPTION 'delivery closure mismatch' USING ERRCODE='23514'; END IF;
   END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER delivery_assignment_consistency AFTER INSERT OR UPDATE ON deliveries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_job_ride_assignment();
UPDATE platform_metadata SET value='m6' WHERE key='foundation';
COMMIT;
