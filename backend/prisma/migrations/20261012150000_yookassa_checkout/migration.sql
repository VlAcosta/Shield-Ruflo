ALTER TABLE "billing_purchase_requests"
  ADD COLUMN "provider" VARCHAR(80),
  ADD COLUMN "external_payment_id" VARCHAR(240),
  ADD COLUMN "provider_status" VARCHAR(80),
  ADD COLUMN "confirmation_url" TEXT,
  ADD COLUMN "paid_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "billing_purchase_requests_external_payment_id_key"
  ON "billing_purchase_requests"("external_payment_id");
