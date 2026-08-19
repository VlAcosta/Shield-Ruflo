CREATE TYPE "webhook_endpoint_status" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');
CREATE TYPE "webhook_event_type" AS ENUM (
  'review.created',
  'review.updated',
  'case.created',
  'case.updated',
  'case.resolved',
  'reply.published',
  'location.health_changed'
);
CREATE TYPE "webhook_delivery_status" AS ENUM ('QUEUED', 'RETRYING', 'DELIVERED', 'DEAD');
CREATE TYPE "webhook_attempt_outcome" AS ENUM ('DELIVERED', 'RETRYABLE_FAILURE', 'NON_RETRYABLE_FAILURE');

CREATE TABLE "webhook_endpoints" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "url" TEXT NOT NULL,
  "status" "webhook_endpoint_status" NOT NULL DEFAULT 'ACTIVE',
  "events" "webhook_event_type"[] NOT NULL,
  "secret_encrypted" TEXT NOT NULL,
  "secret_hint" VARCHAR(24) NOT NULL,
  "secret_version" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" UUID NOT NULL,
  "paused_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "last_delivery_at" TIMESTAMP(3),
  "last_delivery_status" "webhook_delivery_status",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_endpoints_events_not_empty" CHECK (cardinality("events") > 0),
  CONSTRAINT "webhook_endpoints_secret_version_positive" CHECK ("secret_version" > 0),
  CONSTRAINT "webhook_endpoints_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "webhook_endpoints_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "webhook_endpoints_org_status_idx"
  ON "webhook_endpoints"("organization_id", "status");

CREATE TABLE "webhook_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "endpoint_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "event_type" "webhook_event_type" NOT NULL,
  "event_version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "request_body" TEXT NOT NULL,
  "status" "webhook_delivery_status" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 8,
  "response_status" INTEGER,
  "response_body_snippet" TEXT,
  "last_error" TEXT,
  "next_attempt_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "dead_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_deliveries_endpoint_event_key" UNIQUE ("endpoint_id", "event_id"),
  CONSTRAINT "webhook_deliveries_attempts_nonnegative" CHECK ("attempts" >= 0),
  CONSTRAINT "webhook_deliveries_max_attempts_positive" CHECK ("max_attempts" > 0),
  CONSTRAINT "webhook_deliveries_event_version_positive" CHECK ("event_version" > 0),
  CONSTRAINT "webhook_deliveries_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "webhook_deliveries_endpoint_id_fkey"
    FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "webhook_deliveries_org_created_idx"
  ON "webhook_deliveries"("organization_id", "created_at");
CREATE INDEX "webhook_deliveries_endpoint_status_idx"
  ON "webhook_deliveries"("endpoint_id", "status", "created_at");
CREATE INDEX "webhook_deliveries_status_next_idx"
  ON "webhook_deliveries"("status", "next_attempt_at");

CREATE TABLE "webhook_delivery_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "delivery_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "outcome" "webhook_attempt_outcome" NOT NULL,
  "signature_timestamp" INTEGER NOT NULL,
  "response_status" INTEGER,
  "duration_ms" INTEGER,
  "response_body_snippet" TEXT,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "webhook_delivery_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_delivery_attempts_delivery_number_key" UNIQUE ("delivery_id", "attempt_number"),
  CONSTRAINT "webhook_delivery_attempts_attempt_positive" CHECK ("attempt_number" > 0),
  CONSTRAINT "webhook_delivery_attempts_duration_nonnegative" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0),
  CONSTRAINT "webhook_delivery_attempts_delivery_id_fkey"
    FOREIGN KEY ("delivery_id") REFERENCES "webhook_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "webhook_delivery_attempts_delivery_created_idx"
  ON "webhook_delivery_attempts"("delivery_id", "created_at");

CREATE OR REPLACE FUNCTION "bs_assert_webhook_delivery_org_match"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  endpoint_org UUID;
BEGIN
  SELECT "organization_id" INTO endpoint_org
  FROM "webhook_endpoints"
  WHERE "id" = NEW."endpoint_id";

  IF endpoint_org IS NULL OR endpoint_org <> NEW."organization_id" THEN
    RAISE EXCEPTION 'WEBHOOK_ENDPOINT_ORGANIZATION_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "webhook_deliveries_org_match"
BEFORE INSERT OR UPDATE OF "endpoint_id", "organization_id"
ON "webhook_deliveries"
FOR EACH ROW
EXECUTE FUNCTION "bs_assert_webhook_delivery_org_match"();
