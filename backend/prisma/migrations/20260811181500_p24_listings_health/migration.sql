ALTER TABLE "locations"
  ADD COLUMN "phone" VARCHAR(64),
  ADD COLUMN "website" TEXT,
  ADD COLUMN "regular_hours" JSONB,
  ADD COLUMN "categories" JSONB,
  ADD COLUMN "attributes" JSONB,
  ADD COLUMN "images" JSONB;

CREATE TYPE "listing_source_status" AS ENUM ('ACTIVE', 'DEGRADED', 'ERROR', 'DISABLED');
CREATE TYPE "listing_issue_severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "listing_issue_type" AS ENUM ('MISSING', 'MISMATCH', 'STALE', 'DUPLICATE', 'UNMAPPED');

CREATE TABLE "listing_sources" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "integration_account_id" UUID NOT NULL,
  "provider" VARCHAR(80) NOT NULL,
  "external_location_id" VARCHAR(240) NOT NULL,
  "status" "listing_source_status" NOT NULL DEFAULT 'ACTIVE',
  "last_synced_at" TIMESTAMPTZ,
  "last_error_code" VARCHAR(160),
  "last_error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_sources_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "listing_sources_location_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE,
  CONSTRAINT "listing_sources_account_fk" FOREIGN KEY ("integration_account_id") REFERENCES "integration_accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "listing_sources_location_provider_key" UNIQUE ("location_id", "provider"),
  CONSTRAINT "listing_sources_account_external_key" UNIQUE ("integration_account_id", "external_location_id")
);
CREATE INDEX "listing_sources_org_status_idx" ON "listing_sources"("organization_id", "status", "updated_at");

CREATE TABLE "listing_snapshots" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "observed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "provider_updated_at" TIMESTAMPTZ,
  "normalized" JSONB NOT NULL,
  "raw" JSONB,
  "health_score" INTEGER NOT NULL,
  "score_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_snapshots_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "listing_snapshots_location_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE,
  CONSTRAINT "listing_snapshots_source_fk" FOREIGN KEY ("source_id") REFERENCES "listing_sources"("id") ON DELETE CASCADE,
  CONSTRAINT "listing_snapshots_health_check" CHECK ("health_score" >= 0 AND "health_score" <= 100)
);
CREATE INDEX "listing_snapshots_source_observed_idx" ON "listing_snapshots"("source_id", "observed_at" DESC);
CREATE INDEX "listing_snapshots_location_observed_idx" ON "listing_snapshots"("location_id", "observed_at" DESC);

CREATE TABLE "listing_health_issues" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "snapshot_id" UUID NOT NULL,
  "type" "listing_issue_type" NOT NULL,
  "severity" "listing_issue_severity" NOT NULL,
  "field" VARCHAR(80) NOT NULL,
  "expected" JSONB,
  "observed" JSONB,
  "explanation" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_health_issues_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "listing_health_issues_location_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE,
  CONSTRAINT "listing_health_issues_snapshot_fk" FOREIGN KEY ("snapshot_id") REFERENCES "listing_snapshots"("id") ON DELETE CASCADE
);
CREATE INDEX "listing_health_issues_location_severity_idx" ON "listing_health_issues"("location_id", "severity", "created_at" DESC);
CREATE INDEX "listing_health_issues_snapshot_idx" ON "listing_health_issues"("snapshot_id");
