CREATE TYPE "competitive_competitor_status" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "competitive_source_provider" AS ENUM ('MANUAL', 'GOOGLE_PLACES');
CREATE TYPE "competitive_storage_policy" AS ENUM ('PERSISTABLE', 'LIVE_ONLY');
CREATE TYPE "competitive_source_status" AS ENUM ('CONFIGURED', 'DEGRADED', 'ERROR', 'DISABLED');

CREATE TABLE "competitive_competitors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "website" TEXT,
  "status" "competitive_competitor_status" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT NOT NULL DEFAULT '',
  "created_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "competitive_competitors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competitive_competitors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "competitive_competitors_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "competitive_competitors_org_status_idx" ON "competitive_competitors"("organization_id", "status", "created_at");

CREATE TABLE "competitive_locations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "competitor_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "address_label" VARCHAR(500),
  "city" VARCHAR(180),
  "region" VARCHAR(180),
  "country_code" VARCHAR(2),
  "website" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competitive_locations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competitive_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "competitive_locations_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitive_competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "competitive_locations_org_competitor_idx" ON "competitive_locations"("organization_id", "competitor_id", "created_at");

CREATE TABLE "competitive_sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "competitor_location_id" UUID NOT NULL,
  "provider" "competitive_source_provider" NOT NULL,
  "external_id" VARCHAR(512),
  "storage_policy" "competitive_storage_policy" NOT NULL,
  "status" "competitive_source_status" NOT NULL DEFAULT 'CONFIGURED',
  "last_checked_at" TIMESTAMP(3),
  "last_error_code" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competitive_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competitive_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "competitive_sources_competitor_location_id_fkey" FOREIGN KEY ("competitor_location_id") REFERENCES "competitive_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "competitive_sources_location_provider_key" ON "competitive_sources"("competitor_location_id", "provider");
CREATE INDEX "competitive_sources_org_provider_status_idx" ON "competitive_sources"("organization_id", "provider", "status");

CREATE TABLE "competitive_metric_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "competitor_location_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "average_rating" DOUBLE PRECISION,
  "review_count" INTEGER,
  "review_velocity_30d" DOUBLE PRECISION,
  "positive_share" DOUBLE PRECISION,
  "negative_share" DOUBLE PRECISION,
  "response_rate" DOUBLE PRECISION,
  "reputation_score" DOUBLE PRECISION,
  "notes" VARCHAR(2000) NOT NULL DEFAULT '',
  "dedupe_key" VARCHAR(240),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competitive_metric_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competitive_metric_snapshots_rating_check" CHECK ("average_rating" IS NULL OR ("average_rating" BETWEEN 0 AND 5)),
  CONSTRAINT "competitive_metric_snapshots_review_count_check" CHECK ("review_count" IS NULL OR "review_count" >= 0),
  CONSTRAINT "competitive_metric_snapshots_velocity_check" CHECK ("review_velocity_30d" IS NULL OR "review_velocity_30d" >= 0),
  CONSTRAINT "competitive_metric_snapshots_positive_share_check" CHECK ("positive_share" IS NULL OR ("positive_share" BETWEEN 0 AND 1)),
  CONSTRAINT "competitive_metric_snapshots_negative_share_check" CHECK ("negative_share" IS NULL OR ("negative_share" BETWEEN 0 AND 1)),
  CONSTRAINT "competitive_metric_snapshots_response_rate_check" CHECK ("response_rate" IS NULL OR ("response_rate" BETWEEN 0 AND 1)),
  CONSTRAINT "competitive_metric_snapshots_reputation_score_check" CHECK ("reputation_score" IS NULL OR ("reputation_score" BETWEEN 0 AND 100)),
  CONSTRAINT "competitive_metric_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "competitive_metric_snapshots_competitor_location_id_fkey" FOREIGN KEY ("competitor_location_id") REFERENCES "competitive_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "competitive_metric_snapshots_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "competitive_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "competitive_metric_snapshots_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "competitive_metric_snapshots_source_dedupe_key" ON "competitive_metric_snapshots"("source_id", "dedupe_key");
CREATE INDEX "competitive_metric_snapshots_location_observed_idx" ON "competitive_metric_snapshots"("competitor_location_id", "observed_at");
CREATE INDEX "competitive_metric_snapshots_org_observed_idx" ON "competitive_metric_snapshots"("organization_id", "observed_at");
