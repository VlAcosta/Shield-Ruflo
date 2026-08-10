-- Business Shield foundational schema baseline.
--
-- This migration intentionally precedes the existing B6 reviews migration and
-- creates only the objects that B6 depends on. It is additive on a clean
-- database and does not rewrite the already-published B6 migration.
--
-- Existing databases that were provisioned outside Prisma must be baselined
-- with `prisma migrate resolve --applied 20260809210000_foundation_baseline`
-- only after verifying that these objects match. Applying this SQL to such a
-- database is intentionally not made idempotent because that could hide drift.
-- Rollback for a clean, unused database is to drop the created objects in
-- reverse dependency order; production records must instead be preserved and
-- reconciled through a separately reviewed forward migration.

CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "organization_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "onboarding_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "organization_role" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'ANALYST', 'MEMBER');
CREATE TYPE "membership_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');
CREATE TYPE "team_invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "business_status" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "location_status" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "verification_purpose" AS ENUM ('SIGN_IN', 'SIGN_UP', 'PHONE_CHANGE', 'ACCOUNT_RECOVERY');

CREATE TABLE "_service_metadata" (
  "key" VARCHAR(120) NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "_service_metadata_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "phone" VARCHAR(32) NOT NULL,
  "email" VARCHAR(320),
  "first_name" VARCHAR(120),
  "last_name" VARCHAR(120),
  "display_name" VARCHAR(160),
  "position" VARCHAR(160),
  "telegram" VARCHAR(120),
  "avatar_url" TEXT,
  "notification_preferences" JSONB,
  "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
  "phone_verified_at" TIMESTAMP(3),
  "email_verified_at" TIMESTAMP(3),
  "last_login_at" TIMESTAMP(3),
  "profile_completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(180) NOT NULL,
  "slug" VARCHAR(120) NOT NULL,
  "status" "organization_status" NOT NULL DEFAULT 'ACTIVE',
  "onboarding_status" "onboarding_status" NOT NULL DEFAULT 'NOT_STARTED',
  "onboarding_completed_at" TIMESTAMP(3),
  "timezone" VARCHAR(80) NOT NULL DEFAULT 'Europe/Moscow',
  "locale" VARCHAR(16) NOT NULL DEFAULT 'ru-RU',
  "legal_type" VARCHAR(16),
  "inn" VARCHAR(12),
  "kpp" VARCHAR(9),
  "ogrn" VARCHAR(15),
  "legal_address" TEXT,
  "legal_status" VARCHAR(160),
  "registration_date" DATE,
  "registry_source" VARCHAR(120),
  "registry_verified_at" TIMESTAMP(3),
  "onboarding_step" INTEGER NOT NULL DEFAULT 0,
  "onboarding_draft" JSONB,
  "onboarding_started_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "organization_role" NOT NULL DEFAULT 'MEMBER',
  "status" "membership_status" NOT NULL DEFAULT 'ACTIVE',
  "invited_by_user_id" UUID,
  "invited_at" TIMESTAMP(3),
  "joined_at" TIMESTAMP(3),
  "access_expires_at" TIMESTAMP(3),
  "suspended_at" TIMESTAMP(3),
  "suspended_reason" VARCHAR(240),
  "permission_overrides" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "accepted_by_user_id" UUID,
  "email" VARCHAR(320) NOT NULL,
  "name" VARCHAR(180),
  "role" "organization_role" NOT NULL DEFAULT 'MEMBER',
  "token_hash" VARCHAR(128) NOT NULL,
  "status" "team_invitation_status" NOT NULL DEFAULT 'PENDING',
  "access_expires_at" TIMESTAMP(3),
  "permission_overrides" JSONB,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "businesses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "legal_name" VARCHAR(240),
  "industry" VARCHAR(120),
  "website" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "status" "business_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "locations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "status" "location_status" NOT NULL DEFAULT 'ACTIVE',
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "country_code" CHAR(2),
  "region" VARCHAR(160),
  "city" VARCHAR(160),
  "address_line_1" VARCHAR(240),
  "address_line_2" VARCHAR(240),
  "postal_code" VARCHAR(32),
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "timezone" VARCHAR(80),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "active_organization_id" UUID,
  "token_hash" VARCHAR(128) NOT NULL,
  "ip_address" VARCHAR(64),
  "user_agent" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "last_seen_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verification_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "phone" VARCHAR(32) NOT NULL,
  "purpose" "verification_purpose" NOT NULL,
  "code_hash" VARCHAR(128) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "request_ip" VARCHAR(64),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "actor_user_id" UUID,
  "action" VARCHAR(160) NOT NULL,
  "entity_type" VARCHAR(120),
  "entity_id" VARCHAR(120),
  "metadata" JSONB,
  "ip_address" VARCHAR(64),
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organizations_status_idx" ON "organizations"("status");
CREATE INDEX "organizations_inn_idx" ON "organizations"("inn");
CREATE UNIQUE INDEX "organization_members_org_user_key" ON "organization_members"("organization_id", "user_id");
CREATE INDEX "organization_members_user_status_idx" ON "organization_members"("user_id", "status");
CREATE INDEX "organization_members_org_status_idx" ON "organization_members"("organization_id", "status");
CREATE UNIQUE INDEX "team_invitations_token_hash_key" ON "team_invitations"("token_hash");
CREATE INDEX "team_invitations_org_status_created_idx" ON "team_invitations"("organization_id", "status", "created_at");
CREATE INDEX "team_invitations_email_status_idx" ON "team_invitations"("email", "status");
CREATE INDEX "team_invitations_expiry_status_idx" ON "team_invitations"("expires_at", "status");
CREATE INDEX "businesses_org_status_idx" ON "businesses"("organization_id", "status");
CREATE INDEX "businesses_org_primary_idx" ON "businesses"("organization_id", "is_primary");
CREATE INDEX "locations_business_status_idx" ON "locations"("business_id", "status");
CREATE INDEX "locations_business_primary_idx" ON "locations"("business_id", "is_primary");
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_expires_idx" ON "sessions"("user_id", "expires_at");
CREATE INDEX "sessions_active_organization_idx" ON "sessions"("active_organization_id");
CREATE INDEX "sessions_expiry_revoked_idx" ON "sessions"("expires_at", "revoked_at");
CREATE INDEX "verification_codes_phone_purpose_created_idx" ON "verification_codes"("phone", "purpose", "created_at");
CREATE INDEX "verification_codes_expiry_consumed_idx" ON "verification_codes"("expires_at", "consumed_at");
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs"("organization_id", "created_at");
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs"("entity_type", "entity_id");

ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_organization_id_fkey" FOREIGN KEY ("active_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "_service_metadata" ("key", "value", "created_at", "updated_at")
VALUES ('foundation', '{"stage":"baseline","schemaVersion":1}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
