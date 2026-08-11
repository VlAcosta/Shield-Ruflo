CREATE TYPE "reputation_case_origin" AS ENUM ('REVIEW', 'AI_TREND', 'MANUAL', 'SURVEY', 'AUTOMATION');
CREATE TYPE "reputation_case_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "reputation_case_status" AS ENUM ('NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL', 'RESOLVED', 'VERIFIED', 'CLOSED');
CREATE TYPE "reputation_case_metric_phase" AS ENUM ('BASELINE', 'RESOLUTION', 'VERIFICATION');

CREATE TABLE "reputation_cases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "category" VARCHAR(120) NOT NULL,
  "severity" "reputation_case_severity" NOT NULL DEFAULT 'MEDIUM',
  "status" "reputation_case_status" NOT NULL DEFAULT 'NEW',
  "origin" "reputation_case_origin" NOT NULL DEFAULT 'MANUAL',
  "owner_member_id" UUID,
  "sla_minutes" INTEGER,
  "due_at" TIMESTAMP(3),
  "root_cause" TEXT,
  "resolution" TEXT,
  "outcome" JSONB,
  "source_dedupe_key" VARCHAR(240),
  "reopened_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "verified_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reputation_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reputation_cases_sla_minutes_check" CHECK ("sla_minutes" IS NULL OR "sla_minutes" >= 0),
  CONSTRAINT "reputation_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reputation_cases_owner_member_id_fkey" FOREIGN KEY ("owner_member_id") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "reputation_cases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "reputation_cases_org_source_dedupe_key" ON "reputation_cases"("organization_id", "source_dedupe_key");
CREATE INDEX "reputation_cases_org_status_due_idx" ON "reputation_cases"("organization_id", "status", "due_at");
CREATE INDEX "reputation_cases_org_severity_created_idx" ON "reputation_cases"("organization_id", "severity", "created_at");
CREATE INDEX "reputation_cases_owner_status_idx" ON "reputation_cases"("owner_member_id", "status");
CREATE INDEX "reputation_cases_org_category_created_idx" ON "reputation_cases"("organization_id", "category", "created_at");

CREATE TABLE "reputation_case_reviews" (
  "case_id" UUID NOT NULL,
  "review_id" UUID NOT NULL,
  "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reputation_case_reviews_pkey" PRIMARY KEY ("case_id", "review_id"),
  CONSTRAINT "reputation_case_reviews_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "reputation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reputation_case_reviews_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "reputation_case_reviews_review_idx" ON "reputation_case_reviews"("review_id", "added_at");

CREATE TABLE "reputation_case_locations" (
  "case_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reputation_case_locations_pkey" PRIMARY KEY ("case_id", "location_id"),
  CONSTRAINT "reputation_case_locations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "reputation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reputation_case_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "reputation_case_locations_location_idx" ON "reputation_case_locations"("location_id", "added_at");

CREATE TABLE "reputation_case_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "action" VARCHAR(120) NOT NULL,
  "from_status" "reputation_case_status",
  "to_status" "reputation_case_status",
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reputation_case_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reputation_case_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reputation_case_activities_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "reputation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reputation_case_activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "reputation_case_activities_org_created_idx" ON "reputation_case_activities"("organization_id", "created_at");
CREATE INDEX "reputation_case_activities_case_created_idx" ON "reputation_case_activities"("case_id", "created_at");

CREATE TABLE "reputation_case_metric_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "phase" "reputation_case_metric_phase" NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "metrics" JSONB NOT NULL,
  "measured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reputation_case_metric_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reputation_case_metric_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reputation_case_metric_snapshots_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "reputation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "reputation_case_metric_snapshots_case_phase_idx" ON "reputation_case_metric_snapshots"("case_id", "phase", "measured_at");
CREATE INDEX "reputation_case_metric_snapshots_org_measured_idx" ON "reputation_case_metric_snapshots"("organization_id", "measured_at");

ALTER TABLE "tasks" ADD COLUMN "case_id" UUID;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "reputation_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tasks_case_idx" ON "tasks"("case_id");
