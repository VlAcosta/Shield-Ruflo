CREATE TYPE "acquisition_campaign_status" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "acquisition_channel" AS ENUM ('QR', 'LINK', 'EMAIL', 'SMS', 'WHATSAPP', 'OTHER');
CREATE TYPE "acquisition_event_type" AS ENUM ('VIEW', 'FEEDBACK_SUBMITTED', 'REVIEW_TARGET_CLICK', 'INVITE_OPENED');
CREATE TYPE "acquisition_feedback_status" AS ENUM ('NEW', 'ACKNOWLEDGED', 'CASE_OPENED', 'ARCHIVED');
CREATE TYPE "acquisition_invite_status" AS ENUM ('CREATED', 'OPENED', 'CONVERTED', 'EXPIRED', 'REVOKED');

CREATE TABLE "review_acquisition_campaigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "business_id" UUID,
  "location_id" UUID,
  "name" VARCHAR(180) NOT NULL,
  "status" "acquisition_campaign_status" NOT NULL DEFAULT 'DRAFT',
  "channel" "acquisition_channel" NOT NULL DEFAULT 'QR',
  "public_slug" VARCHAR(96) NOT NULL,
  "headline" VARCHAR(240) NOT NULL DEFAULT 'Расскажите о вашем опыте',
  "description" TEXT NOT NULL DEFAULT '',
  "thank_you_message" VARCHAR(500) NOT NULL DEFAULT 'Спасибо за обратную связь!',
  "collect_contact" BOOLEAN NOT NULL DEFAULT false,
  "case_below_rating" INTEGER,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "review_acquisition_campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_acquisition_campaigns_case_below_rating_check" CHECK ("case_below_rating" IS NULL OR ("case_below_rating" BETWEEN 1 AND 5)),
  CONSTRAINT "review_acquisition_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_acquisition_campaigns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "review_acquisition_campaigns_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "review_acquisition_campaigns_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "review_acquisition_campaigns_public_slug_key" ON "review_acquisition_campaigns"("public_slug");
CREATE INDEX "review_acquisition_campaigns_org_status_idx" ON "review_acquisition_campaigns"("organization_id", "status", "created_at");
CREATE INDEX "review_acquisition_campaigns_location_status_idx" ON "review_acquisition_campaigns"("location_id", "status");

CREATE TABLE "review_acquisition_targets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "provider" VARCHAR(80) NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "url" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_acquisition_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_acquisition_targets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "review_acquisition_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "review_acquisition_targets_campaign_enabled_idx" ON "review_acquisition_targets"("campaign_id", "enabled", "priority");

CREATE TABLE "review_acquisition_feedback" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "location_id" UUID,
  "invite_id" UUID,
  "rating" INTEGER NOT NULL,
  "text" TEXT NOT NULL DEFAULT '',
  "contact_name" VARCHAR(180),
  "contact_email" VARCHAR(320),
  "contact_phone" VARCHAR(64),
  "consent_to_contact" BOOLEAN NOT NULL DEFAULT false,
  "status" "acquisition_feedback_status" NOT NULL DEFAULT 'NEW',
  "case_id" UUID,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "review_acquisition_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_acquisition_feedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "review_acquisition_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_acquisition_feedback_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "review_acquisition_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_acquisition_feedback_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "review_acquisition_feedback_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "reputation_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "review_acquisition_feedback_org_submitted_idx" ON "review_acquisition_feedback"("organization_id", "submitted_at");
CREATE INDEX "review_acquisition_feedback_campaign_rating_idx" ON "review_acquisition_feedback"("campaign_id", "rating", "submitted_at");
CREATE INDEX "review_acquisition_feedback_case_idx" ON "review_acquisition_feedback"("case_id");

CREATE TABLE "review_acquisition_invites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "channel" "acquisition_channel" NOT NULL DEFAULT 'LINK',
  "token_hash" VARCHAR(128) NOT NULL,
  "token_hint" VARCHAR(16) NOT NULL,
  "status" "acquisition_invite_status" NOT NULL DEFAULT 'CREATED',
  "external_reference" VARCHAR(240),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "opened_at" TIMESTAMP(3),
  "converted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_acquisition_invites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_acquisition_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_acquisition_invites_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "review_acquisition_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_acquisition_invites_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "review_acquisition_invites_token_hash_key" ON "review_acquisition_invites"("token_hash");
CREATE INDEX "review_acquisition_invites_campaign_status_idx" ON "review_acquisition_invites"("campaign_id", "status", "expires_at");

ALTER TABLE "review_acquisition_feedback"
  ADD CONSTRAINT "review_acquisition_feedback_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "review_acquisition_invites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "review_acquisition_feedback_invite_idx" ON "review_acquisition_feedback"("invite_id");

CREATE TABLE "review_acquisition_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "invite_id" UUID,
  "feedback_id" UUID,
  "target_id" UUID,
  "type" "acquisition_event_type" NOT NULL,
  "anonymous_session_hash" VARCHAR(128),
  "dedupe_key" VARCHAR(240),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_acquisition_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_acquisition_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_acquisition_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "review_acquisition_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_acquisition_events_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "review_acquisition_invites"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "review_acquisition_events_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "review_acquisition_feedback"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "review_acquisition_events_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "review_acquisition_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "review_acquisition_events_campaign_dedupe_key" ON "review_acquisition_events"("campaign_id", "dedupe_key");
CREATE INDEX "review_acquisition_events_campaign_type_created_idx" ON "review_acquisition_events"("campaign_id", "type", "created_at");
CREATE INDEX "review_acquisition_events_org_created_idx" ON "review_acquisition_events"("organization_id", "created_at");
