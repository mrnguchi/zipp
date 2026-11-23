-- Additive M4 schema and explicitly labelled development pricing fixtures.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- CreateEnum
CREATE TYPE "DriverApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DriverDocumentKind" AS ENUM ('IDENTITY', 'LICENSE', 'VEHICLE_REGISTRATION', 'INSURANCE');

-- CreateEnum
CREATE TYPE "DriverDocumentStatus" AS ENUM ('PENDING_UPLOAD', 'STORED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ServiceClass" AS ENUM ('EVERYDAY', 'COMFORT', 'PREMIUM', 'DELIVERY_STANDARD', 'DELIVERY_EXPRESS');

-- CreateTable
CREATE TABLE "driver_applications" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "status" "DriverApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "approved_classes" "ServiceClass"[] DEFAULT ARRAY[]::"ServiceClass"[],
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "driver_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_vehicles" (
    "id" UUID NOT NULL,
    "driver_application_id" UUID NOT NULL,
    "registration_plate" VARCHAR(24) NOT NULL,
    "manufacturer" VARCHAR(60) NOT NULL,
    "model" VARCHAR(60) NOT NULL,
    "color" VARCHAR(40) NOT NULL,
    "manufacture_year" INTEGER NOT NULL,
    "seat_count" INTEGER NOT NULL,

    CONSTRAINT "driver_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_documents" (
    "id" UUID NOT NULL,
    "driver_application_id" UUID NOT NULL,
    "application_revision" INTEGER NOT NULL,
    "kind" "DriverDocumentKind" NOT NULL,
    "status" "DriverDocumentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "content_type" VARCHAR(40) NOT NULL,
    "byte_length" INTEGER NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "object_key" UUID NOT NULL,
    "upload_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "document_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_reviews" (
    "id" UUID NOT NULL,
    "driver_application_id" UUID NOT NULL,
    "application_revision" INTEGER NOT NULL,
    "reviewer_user_id" UUID NOT NULL,
    "decision" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "document_ids" UUID[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_presence" (
    "driver_application_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "location_session_id" UUID NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "session_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "captured_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3),

    CONSTRAINT "driver_presence_pkey" PRIMARY KEY ("driver_application_id")
);

-- CreateTable
CREATE TABLE "service_areas" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "minimum_latitude" DOUBLE PRECISION NOT NULL,
    "maximum_latitude" DOUBLE PRECISION NOT NULL,
    "minimum_longitude" DOUBLE PRECISION NOT NULL,
    "maximum_longitude" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "development_only" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_policies" (
    "id" UUID NOT NULL,
    "service_area_id" UUID NOT NULL,
    "version" VARCHAR(80) NOT NULL,
    "service_class" "ServiceClass" NOT NULL,
    "base_fare_xaf" BIGINT NOT NULL,
    "per_kilometer_xaf" BIGINT NOT NULL,
    "per_minute_xaf" BIGINT NOT NULL,
    "minimum_fare_xaf" BIGINT NOT NULL,
    "night_multiplier_bps" INTEGER NOT NULL,
    "commission_bps" INTEGER NOT NULL,
    "cancellation_fee_xaf" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_quotes" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "request_key" UUID NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "pricing_policy_id" UUID NOT NULL,
    "service_class" "ServiceClass" NOT NULL,
    "pickup_latitude" DOUBLE PRECISION NOT NULL,
    "pickup_longitude" DOUBLE PRECISION NOT NULL,
    "destination_latitude" DOUBLE PRECISION NOT NULL,
    "destination_longitude" DOUBLE PRECISION NOT NULL,
    "distance_meters" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "route_version" VARCHAR(80) NOT NULL,
    "route_fingerprint" CHAR(64) NOT NULL,
    "policy_snapshot" JSONB NOT NULL,
    "total_amount_xaf" BIGINT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_by_key" VARCHAR(120),
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_applications_owner_user_id_key" ON "driver_applications"("owner_user_id");

-- CreateIndex
CREATE INDEX "driver_applications_status_created_at_id_idx" ON "driver_applications"("status", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_vehicles_driver_application_id_key" ON "driver_vehicles"("driver_application_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_vehicles_registration_plate_key" ON "driver_vehicles"("registration_plate");

-- CreateIndex
CREATE UNIQUE INDEX "driver_documents_object_key_key" ON "driver_documents"("object_key");

-- CreateIndex
CREATE INDEX "driver_documents_driver_application_id_application_revision_idx" ON "driver_documents"("driver_application_id", "application_revision", "kind", "created_at");

-- CreateIndex
CREATE INDEX "driver_reviews_driver_application_id_created_at_id_idx" ON "driver_reviews"("driver_application_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_presence_location_session_id_key" ON "driver_presence"("location_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_areas_code_key" ON "service_areas"("code");

-- CreateIndex
CREATE INDEX "pricing_policies_service_area_id_service_class_active_idx" ON "pricing_policies"("service_area_id", "service_class", "active");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_policies_service_area_id_service_class_version_key" ON "pricing_policies"("service_area_id", "service_class", "version");

-- CreateIndex
CREATE UNIQUE INDEX "price_quotes_consumed_by_key_key" ON "price_quotes"("consumed_by_key");

-- CreateIndex
CREATE INDEX "price_quotes_owner_user_id_created_at_id_idx" ON "price_quotes"("owner_user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "price_quotes_expires_at_idx" ON "price_quotes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "price_quotes_owner_user_id_request_key_key" ON "price_quotes"("owner_user_id", "request_key");

-- AddForeignKey
ALTER TABLE "driver_vehicles" ADD CONSTRAINT "driver_vehicles_driver_application_id_fkey" FOREIGN KEY ("driver_application_id") REFERENCES "driver_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_application_id_fkey" FOREIGN KEY ("driver_application_id") REFERENCES "driver_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_reviews" ADD CONSTRAINT "driver_reviews_driver_application_id_fkey" FOREIGN KEY ("driver_application_id") REFERENCES "driver_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_presence" ADD CONSTRAINT "driver_presence_driver_application_id_fkey" FOREIGN KEY ("driver_application_id") REFERENCES "driver_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_policies" ADD CONSTRAINT "pricing_policies_service_area_id_fkey" FOREIGN KEY ("service_area_id") REFERENCES "service_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_pricing_policy_id_fkey" FOREIGN KEY ("pricing_policy_id") REFERENCES "pricing_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE driver_applications ADD CONSTRAINT driver_application_owner_fk FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE driver_applications ALTER COLUMN approved_classes SET NOT NULL;
ALTER TABLE driver_applications ADD CONSTRAINT driver_revision_bounds CHECK(revision BETWEEN 1 AND 20 AND cardinality(approved_classes) BETWEEN 0 AND 5 AND (status <> 'APPROVED' OR cardinality(approved_classes)>0));
ALTER TABLE driver_vehicles ADD CONSTRAINT driver_vehicle_bounds CHECK(seat_count BETWEEN 1 AND 7 AND manufacture_year BETWEEN 1990 AND 2100);
ALTER TABLE driver_documents ADD CONSTRAINT driver_document_bounds CHECK(application_revision BETWEEN 1 AND 20 AND byte_length BETWEEN 16 AND 3145728 AND content_sha256 ~ '^[a-f0-9]{64}$' AND content_type IN ('image/jpeg','image/png','application/pdf'));
CREATE UNIQUE INDEX driver_document_single_approved_kind ON driver_documents(driver_application_id,application_revision,kind) WHERE status='APPROVED';
ALTER TABLE driver_reviews ADD CONSTRAINT driver_reviewer_fk FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE driver_reviews ALTER COLUMN document_ids SET NOT NULL;
ALTER TABLE driver_reviews ADD CONSTRAINT driver_review_bounds CHECK(application_revision BETWEEN 1 AND 20 AND decision IN ('approve','reject','suspend','reopen') AND length(btrim(reason)) BETWEEN 10 AND 300 AND cardinality(document_ids) BETWEEN 0 AND 20);
ALTER TABLE driver_presence ADD CONSTRAINT driver_presence_session_fk FOREIGN KEY(auth_session_id) REFERENCES auth_sessions(id) ON DELETE RESTRICT;
ALTER TABLE driver_presence ADD CONSTRAINT driver_presence_observation CHECK(sequence >= 0 AND ((sequence=0 AND latitude IS NULL AND longitude IS NULL AND captured_at IS NULL AND received_at IS NULL) OR (sequence>0 AND latitude IS NOT NULL AND longitude IS NOT NULL AND accuracy_meters IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND accuracy_meters BETWEEN 0 AND 100 AND captured_at IS NOT NULL AND received_at IS NOT NULL)));
ALTER TABLE service_areas ADD CONSTRAINT service_area_bounds CHECK(minimum_latitude BETWEEN -90 AND 90 AND maximum_latitude BETWEEN -90 AND 90 AND minimum_longitude BETWEEN -180 AND 180 AND maximum_longitude BETWEEN -180 AND 180 AND minimum_latitude<maximum_latitude AND minimum_longitude<maximum_longitude);
ALTER TABLE pricing_policies ADD CONSTRAINT pricing_policy_creator_fk FOREIGN KEY(created_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE pricing_policies ADD CONSTRAINT pricing_policy_bounds CHECK(base_fare_xaf BETWEEN 0 AND 9999999 AND per_kilometer_xaf BETWEEN 0 AND 9999999 AND per_minute_xaf BETWEEN 0 AND 9999999 AND minimum_fare_xaf BETWEEN 1 AND 9999999 AND cancellation_fee_xaf BETWEEN 0 AND 9999999 AND night_multiplier_bps BETWEEN 10000 AND 30000 AND commission_bps BETWEEN 0 AND 10000);
CREATE UNIQUE INDEX pricing_policy_single_active_class ON pricing_policies(service_area_id,service_class) WHERE active;
ALTER TABLE price_quotes ADD CONSTRAINT price_quote_owner_fk FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE price_quotes ADD CONSTRAINT price_quote_bounds CHECK(total_amount_xaf BETWEEN 1 AND 1000000000 AND distance_meters BETWEEN 1 AND 200000 AND duration_seconds BETWEEN 1 AND 43200 AND pickup_latitude BETWEEN -90 AND 90 AND destination_latitude BETWEEN -90 AND 90 AND pickup_longitude BETWEEN -180 AND 180 AND destination_longitude BETWEEN -180 AND 180 AND expires_at>created_at AND ((consumed_by_key IS NULL)=(consumed_at IS NULL)));

-- User-authorized sample fares. Never commercial/provider-approved rates.
INSERT INTO service_areas(id,code,name,minimum_latitude,maximum_latitude,minimum_longitude,maximum_longitude,active,development_only)
VALUES('00000000-0000-4000-8000-000000000004','DEV_DOUALA_FIXTURE','Development fixture only',3.9,4.2,9.6,9.9,true,true);
INSERT INTO pricing_policies(id,service_area_id,version,service_class,base_fare_xaf,per_kilometer_xaf,per_minute_xaf,minimum_fare_xaf,night_multiplier_bps,commission_bps,cancellation_fee_xaf)
VALUES
('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000004','development-v1','EVERYDAY',500,200,30,1000,12500,1000,500),
('00000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000000004','development-v1','COMFORT',700,280,42,1400,12500,1000,500),
('00000000-0000-4000-8000-000000000043','00000000-0000-4000-8000-000000000004','development-v1','PREMIUM',1000,400,60,2000,12500,1000,500),
('00000000-0000-4000-8000-000000000044','00000000-0000-4000-8000-000000000004','development-v1','DELIVERY_STANDARD',400,150,20,800,12500,1000,500),
('00000000-0000-4000-8000-000000000045','00000000-0000-4000-8000-000000000004','development-v1','DELIVERY_EXPRESS',600,225,30,1200,12500,1000,500);

GRANT SELECT,INSERT,UPDATE ON driver_applications,driver_vehicles,driver_presence TO zipp_app;
GRANT SELECT,INSERT ON driver_documents,driver_reviews,service_areas,pricing_policies,price_quotes TO zipp_app;
GRANT UPDATE(status) ON driver_documents TO zipp_app;
GRANT UPDATE(active) ON service_areas,pricing_policies TO zipp_app;
GRANT UPDATE(consumed_by_key,consumed_at) ON price_quotes TO zipp_app;
UPDATE platform_metadata SET value='m4' WHERE key='foundation';
COMMIT;
