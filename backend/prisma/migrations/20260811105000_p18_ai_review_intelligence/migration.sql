CREATE TYPE "review_sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED');
CREATE TYPE "ai_operation_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

CREATE TABLE "review_insights" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "review_id" UUID NOT NULL,
  "analysis_version" INTEGER NOT NULL DEFAULT 1,
  "input_hash" VARCHAR(128) NOT NULL,
  "sentiment" "review_sentiment" NOT NULL,
  "operational_urgency" INTEGER NOT NULL,
  "reputation_risk" INTEGER NOT NULL,
  "churn_risk" INTEGER,
  "churn_risk_confidence" DOUBLE PRECISION,
  "churn_risk_insufficient_evidence" BOOLEAN NOT NULL DEFAULT false,
  "legal_pr_risk" BOOLEAN NOT NULL DEFAULT false,
  "legal_pr_risk_reason" TEXT,
  "safety_risk" BOOLEAN NOT NULL DEFAULT false,
  "safety_risk_reason" TEXT,
  "spam_signal_probability" DOUBLE PRECISION,
  "coordinated_signal_probability" DOUBLE PRECISION,
  "signal_reasons" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "root_cause_hypothesis" TEXT,
  "observed_facts" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "inferences" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "recommendations" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "confidence" DOUBLE PRECISION NOT NULL,
  "provider" VARCHAR(80) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "model_version" VARCHAR(80),
  "prompt_version" VARCHAR(80) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_insights_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_insights_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_insights_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_insights_operational_urgency_check" CHECK ("operational_urgency" BETWEEN 0 AND 100),
  CONSTRAINT "review_insights_reputation_risk_check" CHECK ("reputation_risk" BETWEEN 0 AND 100),
  CONSTRAINT "review_insights_churn_risk_check" CHECK ("churn_risk" IS NULL OR "churn_risk" BETWEEN 0 AND 100),
  CONSTRAINT "review_insights_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1)
);

CREATE INDEX "review_insights_org_review_created_idx" ON "review_insights"("organization_id", "review_id", "created_at");
CREATE INDEX "review_insights_org_sentiment_created_idx" ON "review_insights"("organization_id", "sentiment", "created_at");
CREATE INDEX "review_insights_review_version_idx" ON "review_insights"("review_id", "analysis_version");

CREATE TABLE "review_insight_aspects" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "insight_id" UUID NOT NULL,
  "aspect" VARCHAR(80) NOT NULL,
  "sentiment" "review_sentiment" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "evidence" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_insight_aspects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_insight_aspects_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "review_insights"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_insight_aspects_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1)
);
CREATE INDEX "review_insight_aspects_insight_confidence_idx" ON "review_insight_aspects"("insight_id", "confidence");

CREATE TABLE "ai_operations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "review_id" UUID,
  "insight_id" UUID,
  "operation_type" VARCHAR(80) NOT NULL,
  "provider" VARCHAR(80) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "model_version" VARCHAR(80),
  "prompt_version" VARCHAR(80) NOT NULL,
  "input_hash" VARCHAR(128) NOT NULL,
  "output_hash" VARCHAR(128),
  "status" "ai_operation_status" NOT NULL DEFAULT 'QUEUED',
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "latency_ms" INTEGER,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "estimated_cost_micros" INTEGER,
  "confidence" DOUBLE PRECISION,
  "moderation_result" JSONB,
  "error_code" VARCHAR(120),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_operations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_operations_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_operations_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "review_insights"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ai_operations_org_status_created_idx" ON "ai_operations"("organization_id", "status", "created_at");
CREATE INDEX "ai_operations_review_created_idx" ON "ai_operations"("review_id", "created_at");
CREATE INDEX "ai_operations_input_idx" ON "ai_operations"("review_id", "input_hash", "prompt_version", "model");

INSERT INTO "entitlements" ("id", "plan_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), p."id", 'ai.review_intelligence', 'true'::jsonb, CURRENT_TIMESTAMP
FROM "plans" p WHERE p."code" IN ('FREE', 'PRO')
ON CONFLICT ("plan_id", "key") DO NOTHING;
