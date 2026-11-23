-- Additive M3 financial foundation; reviewed local target required.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- CreateEnum
CREATE TYPE "WalletAccountType" AS ENUM ('USER', 'PLATFORM', 'CLEARING');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED', 'RELEASED', 'CAPTURED');

-- CreateEnum
CREATE TYPE "FinancialOperationType" AS ENUM ('TOP_UP', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "FinancialOperationStatus" AS ENUM ('AWAITING_APPROVAL', 'PENDING_CONFIRMATION', 'CONFIRMED', 'FAILED', 'REJECTED', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "wallet_accounts" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID,
    "account_type" "WalletAccountType" NOT NULL,
    "posted_amount_xaf" BIGINT NOT NULL DEFAULT 0,
    "reserved_amount_xaf" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "business_key" VARCHAR(160) NOT NULL,
    "description" VARCHAR(160) NOT NULL,
    "posting_transaction_id" VARCHAR(32) NOT NULL DEFAULT (pg_current_xact_id())::text,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_postings" (
    "id" UUID NOT NULL,
    "ledger_transaction_id" UUID NOT NULL,
    "wallet_account_id" UUID NOT NULL,
    "amount_xaf" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_reservations" (
    "id" UUID NOT NULL,
    "wallet_account_id" UUID NOT NULL,
    "business_key" VARCHAR(160) NOT NULL,
    "amount_xaf" BIGINT NOT NULL,
    "refunded_amount_xaf" BIGINT NOT NULL DEFAULT 0,
    "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "beneficiary_account_id" UUID,
    "platform_fee_xaf" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fund_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_operations" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "operation_type" "FinancialOperationType" NOT NULL,
    "status" "FinancialOperationStatus" NOT NULL,
    "amount_xaf" BIGINT NOT NULL,
    "reservation_id" UUID,
    "failure_code" VARCHAR(80),
    "completed_at" TIMESTAMPTZ(3),
    "response_expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "operation_type" VARCHAR(80) NOT NULL,
    "request_key" UUID NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "request_reason" VARCHAR(300),
    "operation_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "provider_reference" UUID NOT NULL,
    "provider_name" VARCHAR(32) NOT NULL DEFAULT 'local',
    "simulated_outcome" VARCHAR(32) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "reviewed_by_id" UUID,
    "review_reason" VARCHAR(300),
    "reviewed_at" TIMESTAMPTZ(3),

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "event_type" VARCHAR(80) NOT NULL DEFAULT 'finance.payment_requested',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "aggregate_version" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_owner_user_id_key" ON "wallet_accounts"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_business_key_key" ON "ledger_transactions"("business_key");

-- CreateIndex
CREATE INDEX "ledger_postings_wallet_account_id_created_at_id_idx" ON "ledger_postings"("wallet_account_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_postings_ledger_transaction_id_wallet_account_id_key" ON "ledger_postings"("ledger_transaction_id", "wallet_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "fund_reservations_business_key_key" ON "fund_reservations"("business_key");

-- CreateIndex
CREATE INDEX "fund_reservations_wallet_account_id_status_idx" ON "fund_reservations"("wallet_account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "financial_operations_reservation_id_key" ON "financial_operations"("reservation_id");

-- CreateIndex
CREATE INDEX "financial_operations_owner_user_id_created_at_id_idx" ON "financial_operations"("owner_user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "financial_operations_status_created_at_idx" ON "financial_operations"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_actor_user_id_operation_type_request_ke_key" ON "idempotency_records"("actor_user_id", "operation_type", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_operation_id_key" ON "payment_attempts"("operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_provider_reference_key" ON "payment_attempts"("provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_requests_operation_id_key" ON "withdrawal_requests"("operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_operation_id_key" ON "outbox_events"("operation_id");

-- CreateIndex
CREATE INDEX "outbox_events_completed_at_available_at_lease_expires_at_idx" ON "outbox_events"("completed_at", "available_at", "lease_expires_at");

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_postings" ADD CONSTRAINT "ledger_postings_ledger_transaction_id_fkey" FOREIGN KEY ("ledger_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_postings" ADD CONSTRAINT "ledger_postings_wallet_account_id_fkey" FOREIGN KEY ("wallet_account_id") REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_reservations" ADD CONSTRAINT "fund_reservations_wallet_account_id_fkey" FOREIGN KEY ("wallet_account_id") REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "financial_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "financial_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Explicit financial constraints and privilege boundaries, beyond Prisma's schema DSL.
ALTER TABLE wallet_accounts ADD CONSTRAINT wallet_account_owner_kind CHECK ((account_type = 'USER') = (owner_user_id IS NOT NULL));
ALTER TABLE wallet_accounts ADD CONSTRAINT wallet_account_amount_bounds CHECK (posted_amount_xaf BETWEEN -9000000000000 AND 9000000000000 AND reserved_amount_xaf >= 0 AND (account_type = 'CLEARING' OR posted_amount_xaf >= reserved_amount_xaf));
CREATE UNIQUE INDEX wallet_account_single_system_kind ON wallet_accounts(account_type) WHERE account_type <> 'USER';
ALTER TABLE ledger_postings ADD CONSTRAINT ledger_posting_nonzero CHECK (amount_xaf <> 0 AND amount_xaf BETWEEN -1000000000 AND 1000000000);
ALTER TABLE fund_reservations ADD CONSTRAINT fund_reservation_amount_bounds CHECK (amount_xaf BETWEEN 1 AND 1000000000 AND refunded_amount_xaf BETWEEN 0 AND amount_xaf AND (platform_fee_xaf IS NULL OR platform_fee_xaf BETWEEN 0 AND amount_xaf));
ALTER TABLE fund_reservations ADD CONSTRAINT reservation_beneficiary_fk FOREIGN KEY (beneficiary_account_id) REFERENCES wallet_accounts(id) ON DELETE RESTRICT;
ALTER TABLE financial_operations ADD CONSTRAINT financial_operation_amount_bounds CHECK (amount_xaf BETWEEN 1 AND 1000000000);
ALTER TABLE financial_operations ADD CONSTRAINT financial_operation_owner_fk FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE financial_operations ADD CONSTRAINT financial_operation_reservation_fk FOREIGN KEY (reservation_id) REFERENCES fund_reservations(id) ON DELETE RESTRICT;
ALTER TABLE financial_operations ADD CONSTRAINT financial_operation_hold_kind CHECK ((operation_type = 'WITHDRAWAL') = (reservation_id IS NOT NULL));
ALTER TABLE financial_operations ADD CONSTRAINT financial_operation_response_expiry CHECK ((completed_at IS NULL AND response_expires_at IS NULL) OR (completed_at IS NOT NULL AND response_expires_at = completed_at + interval '24 hours'));
ALTER TABLE financial_operations ADD CONSTRAINT financial_operation_completion CHECK ((status IN ('CONFIRMED','FAILED','REJECTED')) = (completed_at IS NOT NULL));
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_operation_fk FOREIGN KEY (operation_id) REFERENCES financial_operations(id) ON DELETE RESTRICT;
ALTER TABLE withdrawal_requests ADD CONSTRAINT withdrawal_reviewer_fk FOREIGN KEY (reviewed_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE outbox_events ADD CONSTRAINT outbox_operation_fk FOREIGN KEY (operation_id) REFERENCES financial_operations(id) ON DELETE RESTRICT;
ALTER TABLE outbox_events ADD CONSTRAINT outbox_command_version CHECK (schema_version = 1 AND aggregate_version >= 1 AND attempts >= 0);

-- Only inserts made in the creating transaction can append postings to its header.
CREATE FUNCTION apply_financial_posting() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ledger_transactions WHERE id = NEW.ledger_transaction_id AND posting_transaction_id = pg_current_xact_id()::text) THEN
    RAISE EXCEPTION 'ledger transaction is immutable' USING ERRCODE = '23514';
  END IF;
  UPDATE public.wallet_accounts SET posted_amount_xaf = posted_amount_xaf + NEW.amount_xaf WHERE id = NEW.wallet_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet account missing' USING ERRCODE = '23503'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION apply_financial_posting() FROM PUBLIC;
CREATE TRIGGER ledger_posting_apply BEFORE INSERT ON ledger_postings FOR EACH ROW EXECUTE FUNCTION apply_financial_posting();

CREATE FUNCTION require_balanced_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE total numeric; entries bigint;
BEGIN
  SELECT COALESCE(sum(amount_xaf),0), count(*) INTO total, entries FROM public.ledger_postings WHERE ledger_transaction_id = NEW.id;
  IF entries < 2 OR total <> 0 THEN RAISE EXCEPTION 'ledger must balance' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION require_balanced_ledger() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER ledger_transaction_balanced AFTER INSERT ON ledger_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_balanced_ledger();

CREATE FUNCTION require_reservation_balance() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE account_id uuid; expected numeric; actual bigint;
BEGIN
  IF TG_TABLE_NAME = 'wallet_accounts' THEN account_id := NEW.id; ELSE account_id := NEW.wallet_account_id; END IF;
  SELECT COALESCE(sum(amount_xaf),0) INTO expected FROM public.fund_reservations WHERE wallet_account_id = account_id AND status = 'RESERVED';
  SELECT reserved_amount_xaf INTO actual FROM public.wallet_accounts WHERE id = account_id;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'reservation balance mismatch' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION require_reservation_balance() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER wallet_reservations_balanced AFTER INSERT OR UPDATE ON wallet_accounts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_reservation_balance();
CREATE CONSTRAINT TRIGGER fund_reservations_balanced AFTER INSERT OR UPDATE ON fund_reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_reservation_balance();

INSERT INTO wallet_accounts (id, account_type) VALUES ('00000000-0000-4000-8000-000000000001','PLATFORM'), ('00000000-0000-4000-8000-000000000002','CLEARING');
GRANT SELECT ON wallet_accounts, ledger_transactions, ledger_postings, fund_reservations, financial_operations, idempotency_records, payment_attempts, withdrawal_requests, outbox_events TO zipp_app;
GRANT INSERT (id, owner_user_id, account_type, created_at) ON wallet_accounts TO zipp_app;
GRANT UPDATE (reserved_amount_xaf) ON wallet_accounts TO zipp_app;
GRANT INSERT ON ledger_transactions, ledger_postings, fund_reservations, financial_operations, idempotency_records, payment_attempts, withdrawal_requests, outbox_events TO zipp_app;
GRANT UPDATE ON fund_reservations, financial_operations, withdrawal_requests, outbox_events TO zipp_app;
-- No runtime UPDATE/DELETE on posted history, request identities or provider references.
UPDATE platform_metadata SET value = 'm3' WHERE key = 'foundation';
COMMIT;
