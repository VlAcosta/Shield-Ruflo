-- Business Shield Phase 2 billing payments.
-- Durable, tenant-scoped payment state and idempotent webhook ledger.

CREATE TYPE "payment_status" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'CANCELED', 'FAILED');
CREATE TYPE "billing_checkout_kind" AS ENUM ('PLAN', 'CONSTRUCTOR');

CREATE TABLE "payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "subscription_id" UUID,
  "plan_id" UUID,
  "provider" VARCHAR(80) NOT NULL,
  "provider_payment_id" VARCHAR(240),
  "idempotency_key" VARCHAR(160) NOT NULL,
  "checkout_kind" "billing_checkout_kind" NOT NULL,
  "status" "payment_status" NOT NULL DEFAULT 'CREATED',
  "provider_status" VARCHAR(80),
  "amount_cents" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
  "description" VARCHAR(240) NOT NULL,
  "confirmation_url" TEXT,
  "test" BOOLEAN NOT NULL DEFAULT false,
  "checkout_payload" JSONB,
  "provider_metadata" JSONB,
  "paid_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" VARCHAR(80) NOT NULL,
  "event_key" VARCHAR(160) NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "provider_object_id" VARCHAR(240) NOT NULL,
  "payload" JSONB NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "error_code" VARCHAR(120),
  CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");
CREATE UNIQUE INDEX "payments_provider_external_key" ON "payments"("provider", "provider_payment_id");
CREATE INDEX "payments_org_created_idx" ON "payments"("organization_id", "created_at");
CREATE INDEX "payments_org_status_created_idx" ON "payments"("organization_id", "status", "created_at");

CREATE UNIQUE INDEX "billing_webhook_events_event_key_key" ON "billing_webhook_events"("event_key");
CREATE INDEX "billing_webhook_provider_object_idx" ON "billing_webhook_events"("provider", "provider_object_id");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
