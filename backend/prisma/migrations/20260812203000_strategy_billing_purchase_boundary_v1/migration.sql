-- Strategy P0: truthful commercial boundary while online payment provider is absent.
-- A purchase request is durable and auditable, but it never activates a subscription
-- and never represents a completed payment.

CREATE TYPE "billing_purchase_request_status" AS ENUM (
  'OPEN',
  'CONTACTED',
  'INVOICED',
  'COMPLETED',
  'CANCELED'
);

CREATE TABLE "billing_purchase_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "requested_by_user_id" UUID NOT NULL,
  "plan_code" VARCHAR(80) NOT NULL,
  "billing_interval" VARCHAR(24) NOT NULL,
  "quoted_amount_cents" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
  "status" "billing_purchase_request_status" NOT NULL DEFAULT 'OPEN',
  "idempotency_key" VARCHAR(200) NOT NULL,
  "contact_email" VARCHAR(320),
  "contact_phone" VARCHAR(64),
  "requested_return_url" TEXT,
  "metadata" JSONB,
  "contacted_at" TIMESTAMP(3),
  "invoiced_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_purchase_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_purchase_requests_amount_check" CHECK ("quoted_amount_cents" >= 0),
  CONSTRAINT "billing_purchase_requests_interval_check" CHECK ("billing_interval" IN ('monthly', 'annual')),
  CONSTRAINT "billing_purchase_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "billing_purchase_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "billing_purchase_requests_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "plans"("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "billing_purchase_requests_idempotency_key_key"
  ON "billing_purchase_requests"("idempotency_key");
CREATE INDEX "billing_purchase_requests_org_status_created_idx"
  ON "billing_purchase_requests"("organization_id", "status", "created_at");
CREATE INDEX "billing_purchase_requests_user_created_idx"
  ON "billing_purchase_requests"("requested_by_user_id", "created_at");
