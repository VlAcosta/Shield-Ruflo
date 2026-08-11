ALTER TYPE "review_reply_status" ADD VALUE IF NOT EXISTS 'PUBLISH_QUEUED';
ALTER TYPE "review_reply_status" ADD VALUE IF NOT EXISTS 'PUBLISHING';
ALTER TYPE "review_reply_status" ADD VALUE IF NOT EXISTS 'PUBLISH_FAILED';
ALTER TYPE "review_reply_status" ADD VALUE IF NOT EXISTS 'PUBLISH_UNKNOWN';

CREATE TYPE "review_reply_origin" AS ENUM ('HUMAN', 'AI', 'AI_EDITED', 'AUTOPILOT');

CREATE TABLE "brand_voice_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "tone" VARCHAR(32) NOT NULL DEFAULT 'PROFESSIONAL',
  "formality" VARCHAR(32) NOT NULL DEFAULT 'BALANCED',
  "primary_language" VARCHAR(16) NOT NULL DEFAULT 'ru',
  "response_length" VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
  "greeting_style" VARCHAR(240) NOT NULL DEFAULT '',
  "signature" VARCHAR(240) NOT NULL DEFAULT '',
  "preferred_phrases" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "prohibited_phrases" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "legal_disclaimer" TEXT NOT NULL DEFAULT '',
  "compensation_policy" VARCHAR(32) NOT NULL DEFAULT 'REQUIRE_APPROVAL',
  "escalation_triggers" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "custom_instructions" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "brand_voice_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brand_voice_profiles_organization_id_key" UNIQUE ("organization_id"),
  CONSTRAINT "brand_voice_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "reply_autopilot_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "minimum_rating" INTEGER NOT NULL DEFAULT 4,
  "maximum_reputation_risk" INTEGER NOT NULL DEFAULT 20,
  "minimum_ai_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.95,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reply_autopilot_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reply_autopilot_policies_organization_id_key" UNIQUE ("organization_id"),
  CONSTRAINT "reply_autopilot_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reply_autopilot_min_rating_check" CHECK ("minimum_rating" BETWEEN 1 AND 5),
  CONSTRAINT "reply_autopilot_reputation_risk_check" CHECK ("maximum_reputation_risk" BETWEEN 0 AND 100),
  CONSTRAINT "reply_autopilot_confidence_check" CHECK ("minimum_ai_confidence" BETWEEN 0 AND 1)
);

ALTER TABLE "review_replies"
  ADD COLUMN "origin" "review_reply_origin" NOT NULL DEFAULT 'HUMAN',
  ADD COLUMN "generation_mode" VARCHAR(32),
  ADD COLUMN "policy_decision" VARCHAR(32),
  ADD COLUMN "policy_version" VARCHAR(80),
  ADD COLUMN "policy_metadata" JSONB,
  ADD COLUMN "provider_state" VARCHAR(80),
  ADD COLUMN "provider_policy_violation" JSONB,
  ADD COLUMN "last_reconciled_at" TIMESTAMP(3);

ALTER TABLE "ai_operations" ADD COLUMN "reply_id" UUID;
ALTER TABLE "ai_operations"
  ADD CONSTRAINT "ai_operations_reply_id_fkey"
  FOREIGN KEY ("reply_id") REFERENCES "review_replies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ai_operations_reply_created_idx" ON "ai_operations"("reply_id", "created_at");

INSERT INTO "entitlements" ("id", "plan_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), p."id", k."key",
       CASE WHEN p."code" = 'PRO' THEN 'true'::jsonb ELSE 'false'::jsonb END,
       CURRENT_TIMESTAMP
FROM "plans" p
CROSS JOIN (VALUES ('ai.reply_copilot'), ('ai.autopilot')) AS k("key")
WHERE p."code" IN ('FREE', 'PRO')
ON CONFLICT ("plan_id", "key") DO NOTHING;
