-- Additive M2 migration. Metadata/grants commit with the tables, or all roll back.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETION_REQUESTED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'DRIVER', 'SUPPORT', 'FINANCE', 'ADMIN');

-- CreateEnum
CREATE TYPE "ChallengePurpose" AS ENUM ('ENROLL', 'LOGIN_SMS', 'LOGIN_MFA', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "SavedPlaceKind" AS ENUM ('HOME', 'WORK', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "password_hash" VARCHAR(256),
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "roles" "UserRole"[] DEFAULT ARRAY['CUSTOMER']::"UserRole"[],
    "phone_verified_at" TIMESTAMPTZ(3),
    "two_factor_secret" VARCHAR(512),
    "pending_two_factor" VARCHAR(512),
    "pending_two_factor_until" TIMESTAMPTZ(3),
    "pending_mfa_attempts" INTEGER NOT NULL DEFAULT 0,
    "mfa_failure_count" INTEGER NOT NULL DEFAULT 0,
    "mfa_failure_until" TIMESTAMPTZ(3),
    "last_totp_step" INTEGER NOT NULL DEFAULT -1,
    "deletion_requested_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "language" VARCHAR(2) NOT NULL DEFAULT 'en',
    "preferred_mode" VARCHAR(12) NOT NULL DEFAULT 'customer',
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "mfa_verified_at" TIMESTAMPTZ(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_credentials" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "refresh_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "ChallengePurpose" NOT NULL,
    "code_hash" CHAR(64),
    "pending_password_hash" VARCHAR(256),
    "pending_display_name" VARCHAR(100),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "chain_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_places" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "SavedPlaceKind" NOT NULL DEFAULT 'OTHER',
    "name" VARCHAR(100) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_audit" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "subject_id" UUID,
    "action" VARCHAR(96) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_revoked_at_expires_at_idx" ON "auth_sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_credentials_token_hash_key" ON "refresh_credentials"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_credentials_session_id_expires_at_idx" ON "refresh_credentials"("session_id", "expires_at");

-- CreateIndex
CREATE INDEX "refresh_credentials_expires_at_idx" ON "refresh_credentials"("expires_at");

-- CreateIndex
CREATE INDEX "auth_challenges_user_id_purpose_used_at_idx" ON "auth_challenges"("user_id", "purpose", "used_at");

-- CreateIndex
CREATE INDEX "auth_challenges_expires_at_idx" ON "auth_challenges"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_codes_user_id_code_hash_key" ON "recovery_codes"("user_id", "code_hash");

-- CreateIndex
CREATE INDEX "saved_places_user_id_created_at_id_idx" ON "saved_places"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "security_audit_actor_id_created_at_idx" ON "security_audit"("actor_id", "created_at");
CREATE INDEX "security_audit_subject_id_created_at_idx" ON "security_audit"("subject_id", "created_at");

-- AddForeignKey
ALTER TABLE "account_profiles" ADD CONSTRAINT "account_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_credentials" ADD CONSTRAINT "refresh_credentials_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE users ALTER COLUMN roles SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_phone_e164 CHECK (phone ~ '^[+][1-9][0-9]{7,14}$');
ALTER TABLE users ADD CONSTRAINT users_roles_nonempty CHECK (cardinality(roles) BETWEEN 1 AND 5);
ALTER TABLE users ADD CONSTRAINT users_active_credentials CHECK (status <> 'ACTIVE' OR (password_hash IS NOT NULL AND phone_verified_at IS NOT NULL));
ALTER TABLE users ADD CONSTRAINT users_mfa_attempts CHECK (pending_mfa_attempts BETWEEN 0 AND 5 AND mfa_failure_count BETWEEN 0 AND 5 AND last_totp_step >= -1);
ALTER TABLE account_profiles ADD CONSTRAINT account_profile_preferences CHECK (language IN ('en','fr') AND preferred_mode IN ('customer','driver') AND length(btrim(display_name)) > 0);
ALTER TABLE auth_sessions ADD CONSTRAINT auth_session_expiry CHECK (expires_at > created_at);
ALTER TABLE auth_challenges ADD CONSTRAINT challenge_budget CHECK (attempts BETWEEN 0 AND 5 AND chain_expires_at >= expires_at);
ALTER TABLE auth_challenges ADD CONSTRAINT challenge_proof CHECK ((purpose = 'LOGIN_MFA' AND code_hash IS NULL) OR (purpose <> 'LOGIN_MFA' AND code_hash IS NOT NULL));
ALTER TABLE auth_challenges ADD CONSTRAINT enrollment_payload CHECK (purpose <> 'ENROLL' OR (pending_password_hash IS NOT NULL AND pending_display_name IS NOT NULL));
ALTER TABLE saved_places ADD CONSTRAINT saved_place_coordinates CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);
ALTER TABLE saved_places ADD CONSTRAINT saved_place_names CHECK (length(btrim(name)) > 0 AND length(btrim(label)) > 0);
CREATE UNIQUE INDEX saved_place_single_shortcut ON saved_places(user_id, kind) WHERE kind IN ('HOME','WORK');

GRANT SELECT, INSERT, UPDATE ON users, account_profiles, auth_sessions, refresh_credentials, auth_challenges, recovery_codes, saved_places TO zipp_app;
GRANT DELETE ON recovery_codes, saved_places TO zipp_app;
-- Runtime audit is append-only. Read/export and retention require a separate operator role.
GRANT INSERT ON security_audit TO zipp_app;
UPDATE platform_metadata SET value = 'm2' WHERE key = 'foundation';
COMMIT;
