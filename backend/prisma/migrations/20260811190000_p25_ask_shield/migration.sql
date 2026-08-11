CREATE TYPE "ask_shield_status" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "ask_shield_queries" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "created_by_user_id" UUID,
  "question" TEXT NOT NULL,
  "status" "ask_shield_status" NOT NULL DEFAULT 'RUNNING',
  "answer" TEXT,
  "evidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "provider" VARCHAR(80),
  "model" VARCHAR(180),
  "prompt_version" VARCHAR(80),
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "estimated_cost_micros" BIGINT,
  "error_code" VARCHAR(160),
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ,
  CONSTRAINT "ask_shield_queries_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "ask_shield_queries_user_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "ask_shield_queries_org_created_idx" ON "ask_shield_queries"("organization_id", "created_at" DESC);
CREATE INDEX "ask_shield_queries_org_status_idx" ON "ask_shield_queries"("organization_id", "status", "created_at" DESC);
