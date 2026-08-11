CREATE TYPE "ai_visibility_probe_status" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "ai_visibility_run_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "ai_visibility_sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNKNOWN');
CREATE TYPE "ai_visibility_citation_measurement" AS ENUM ('SUPPORTED', 'UNSUPPORTED');

CREATE TABLE "ai_visibility_probes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID,
  "name" VARCHAR(180) NOT NULL,
  "query" TEXT NOT NULL,
  "language_code" VARCHAR(16) NOT NULL DEFAULT 'ru',
  "country_code" CHAR(2),
  "status" "ai_visibility_probe_status" NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ,
  CONSTRAINT "ai_visibility_probes_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_visibility_probes_location_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL,
  CONSTRAINT "ai_visibility_probes_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "ai_visibility_probes_org_status_idx" ON "ai_visibility_probes"("organization_id", "status", "created_at");
CREATE INDEX "ai_visibility_probes_location_idx" ON "ai_visibility_probes"("location_id", "status");

CREATE TABLE "ai_visibility_runs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "probe_id" UUID NOT NULL,
  "status" "ai_visibility_run_status" NOT NULL DEFAULT 'QUEUED',
  "provider" VARCHAR(80),
  "model" VARCHAR(180),
  "model_version" VARCHAR(180),
  "prompt_version" VARCHAR(80),
  "input_hash" VARCHAR(128),
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "estimated_cost_micros" BIGINT,
  "error_code" VARCHAR(160),
  "error_message" TEXT,
  "queued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_visibility_runs_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_visibility_runs_probe_fk" FOREIGN KEY ("probe_id") REFERENCES "ai_visibility_probes"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_visibility_runs_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "ai_visibility_runs_org_status_idx" ON "ai_visibility_runs"("organization_id", "status", "created_at");
CREATE INDEX "ai_visibility_runs_probe_created_idx" ON "ai_visibility_runs"("probe_id", "created_at");

CREATE TABLE "ai_visibility_results" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "run_id" UUID NOT NULL UNIQUE,
  "brand_mentioned" BOOLEAN NOT NULL,
  "brand_position" INTEGER,
  "sentiment" "ai_visibility_sentiment" NOT NULL DEFAULT 'UNKNOWN',
  "answer_text" TEXT NOT NULL,
  "recommendations" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "citation_measurement" "ai_visibility_citation_measurement" NOT NULL DEFAULT 'UNSUPPORTED',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_visibility_results_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_visibility_results_run_fk" FOREIGN KEY ("run_id") REFERENCES "ai_visibility_runs"("id") ON DELETE CASCADE
);

CREATE INDEX "ai_visibility_results_org_created_idx" ON "ai_visibility_results"("organization_id", "created_at");

CREATE TABLE "ai_visibility_citations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "result_id" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "title" VARCHAR(500),
  "domain" VARCHAR(255),
  "position" INTEGER,
  "quality_score" DOUBLE PRECISION,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_visibility_citations_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_visibility_citations_result_fk" FOREIGN KEY ("result_id") REFERENCES "ai_visibility_results"("id") ON DELETE CASCADE
);

CREATE INDEX "ai_visibility_citations_result_idx" ON "ai_visibility_citations"("result_id", "position");
CREATE INDEX "ai_visibility_citations_org_created_idx" ON "ai_visibility_citations"("organization_id", "created_at");

CREATE TABLE "ai_visibility_competitors" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "result_id" UUID NOT NULL,
  "name" VARCHAR(240) NOT NULL,
  "position" INTEGER,
  "matched_competitor_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_visibility_competitors_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_visibility_competitors_result_fk" FOREIGN KEY ("result_id") REFERENCES "ai_visibility_results"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_visibility_competitors_match_fk" FOREIGN KEY ("matched_competitor_id") REFERENCES "competitive_competitors"("id") ON DELETE SET NULL
);

CREATE INDEX "ai_visibility_competitors_result_idx" ON "ai_visibility_competitors"("result_id", "position");
CREATE INDEX "ai_visibility_competitors_org_created_idx" ON "ai_visibility_competitors"("organization_id", "created_at");

INSERT INTO "entitlements" ("id", "plan_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), p."id", 'ai_visibility.enabled', CASE WHEN p."code" = 'PRO' THEN 'true'::jsonb ELSE 'false'::jsonb END, CURRENT_TIMESTAMP
FROM "plans" p
WHERE p."code" IN ('FREE', 'PRO')
ON CONFLICT ("plan_id", "key") DO NOTHING;
