-- Business Shield P6-P11 operational domains.
-- Additive migration: analytics use existing review tables, while Tasks,
-- Integrations, durable jobs, Automations, Reports, Notifications and Billing
-- receive normalized tenant-scoped persistence.

ALTER TYPE "review_reply_status" ADD VALUE IF NOT EXISTS 'READY_TO_PUBLISH';
ALTER TYPE "review_reply_status" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "reviews"
  ADD COLUMN IF NOT EXISTS "provider_updated_at" TIMESTAMP(3);

ALTER TABLE "review_replies"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "provider_reply_id" VARCHAR(240),
  ADD COLUMN IF NOT EXISTS "publish_requested_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "retry_count" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "review_replies_review_version_key"
  ON "review_replies"("review_id", "version");
CREATE INDEX IF NOT EXISTS "reviews_org_rating_received_idx"
  ON "reviews"("organization_id", "rating", "received_at");
CREATE INDEX IF NOT EXISTS "review_sources_org_provider_idx"
  ON "review_sources"("organization_id", "provider");

CREATE TYPE "task_status" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING', 'DONE', 'ARCHIVED');
CREATE TYPE "task_priority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "integration_status" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'DEGRADED', 'ERROR', 'DISABLED');
CREATE TYPE "integration_sync_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');
CREATE TYPE "job_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');
CREATE TYPE "automation_execution_status" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');
CREATE TYPE "report_status" AS ENUM ('QUEUED', 'GENERATING', 'READY', 'FAILED');
CREATE TYPE "notification_status" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');
CREATE TYPE "subscription_status" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'INCOMPLETE');

CREATE TABLE "tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "business_id" UUID,
  "location_id" UUID,
  "review_id" UUID,
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT,
  "status" "task_status" NOT NULL DEFAULT 'NEW',
  "priority" "task_priority" NOT NULL DEFAULT 'MEDIUM',
  "deadline" TIMESTAMP(3),
  "created_by_user_id" UUID NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "completed_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_assignees" (
  "task_id" UUID NOT NULL,
  "organization_member_id" UUID NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id", "organization_member_id")
);

CREATE TABLE "task_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "text" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_checklist_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "task_id" UUID NOT NULL,
  "text" VARCHAR(400) NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "task_id" UUID NOT NULL,
  "file_name" VARCHAR(240) NOT NULL,
  "mime_type" VARCHAR(160),
  "size_bytes" INTEGER,
  "storage_key" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "action" VARCHAR(120) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tasks_org_status_position_idx" ON "tasks"("organization_id", "status", "position");
CREATE INDEX "tasks_org_priority_deadline_idx" ON "tasks"("organization_id", "priority", "deadline");
CREATE INDEX "tasks_review_idx" ON "tasks"("review_id");
CREATE INDEX "tasks_business_status_idx" ON "tasks"("business_id", "status");
CREATE INDEX "tasks_location_status_idx" ON "tasks"("location_id", "status");
CREATE INDEX "task_assignees_member_assigned_idx" ON "task_assignees"("organization_member_id", "assigned_at");
CREATE INDEX "task_comments_org_created_idx" ON "task_comments"("organization_id", "created_at");
CREATE INDEX "task_comments_task_created_idx" ON "task_comments"("task_id", "created_at");
CREATE INDEX "task_checklist_task_position_idx" ON "task_checklist_items"("task_id", "position");
CREATE INDEX "task_attachments_task_created_idx" ON "task_attachments"("task_id", "created_at");
CREATE INDEX "task_activities_org_created_idx" ON "task_activities"("organization_id", "created_at");
CREATE INDEX "task_activities_task_created_idx" ON "task_activities"("task_id", "created_at");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_organization_member_id_fkey" FOREIGN KEY ("organization_member_id") REFERENCES "organization_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "integration_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "provider" VARCHAR(80) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "external_account_id" VARCHAR(240),
  "status" "integration_status" NOT NULL DEFAULT 'DISCONNECTED',
  "configuration" JSONB,
  "last_validated_at" TIMESTAMP(3),
  "last_synced_at" TIMESTAMP(3),
  "last_error_code" VARCHAR(120),
  "last_error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integration_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_credentials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "key" VARCHAR(120) NOT NULL,
  "encrypted_value" TEXT NOT NULL,
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_sync_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "status" "integration_sync_status" NOT NULL DEFAULT 'QUEUED',
  "trigger" VARCHAR(80) NOT NULL DEFAULT 'manual',
  "imported_count" INTEGER NOT NULL DEFAULT 0,
  "updated_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "error_code" VARCHAR(120),
  "error_message" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "type" VARCHAR(120) NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_accounts_org_provider_external_key" ON "integration_accounts"("organization_id", "provider", "external_account_id");
CREATE INDEX "integration_accounts_org_status_idx" ON "integration_accounts"("organization_id", "status");
CREATE UNIQUE INDEX "integration_credentials_account_key_key" ON "integration_credentials"("account_id", "key");
CREATE INDEX "integration_sync_runs_org_status_created_idx" ON "integration_sync_runs"("organization_id", "status", "created_at");
CREATE INDEX "integration_sync_runs_account_created_idx" ON "integration_sync_runs"("account_id", "created_at");
CREATE INDEX "integration_events_org_created_idx" ON "integration_events"("organization_id", "created_at");
CREATE INDEX "integration_events_account_created_idx" ON "integration_events"("account_id", "created_at");

ALTER TABLE "integration_accounts" ADD CONSTRAINT "integration_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "integration_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "integration_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "integration_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "type" VARCHAR(120) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "job_status" NOT NULL DEFAULT 'QUEUED',
  "dedupe_key" VARCHAR(240),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "lock_token" VARCHAR(120),
  "last_error" TEXT,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "jobs_org_dedupe_key" ON "jobs"("organization_id", "dedupe_key");
CREATE INDEX "jobs_status_run_at_idx" ON "jobs"("status", "run_at");
CREATE INDEX "jobs_org_created_idx" ON "jobs"("organization_id", "created_at");
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "automations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "trigger" VARCHAR(120) NOT NULL,
  "conditions" JSONB NOT NULL,
  "actions" JSONB NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_run_at" TIMESTAMP(3),
  "next_run_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_executions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "automation_id" UUID NOT NULL,
  "status" "automation_execution_status" NOT NULL DEFAULT 'RUNNING',
  "dedupe_key" VARCHAR(240) NOT NULL,
  "trigger_payload" JSONB,
  "action_result" JSONB,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "automations_org_enabled_idx" ON "automations"("organization_id", "enabled");
CREATE INDEX "automations_org_trigger_idx" ON "automations"("organization_id", "trigger");
CREATE UNIQUE INDEX "automation_executions_automation_dedupe_key" ON "automation_executions"("automation_id", "dedupe_key");
CREATE INDEX "automation_executions_org_started_idx" ON "automation_executions"("organization_id", "started_at");
ALTER TABLE "automations" ADD CONSTRAINT "automations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "type" VARCHAR(80) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "status" "report_status" NOT NULL DEFAULT 'QUEUED',
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "data" JSONB,
  "storage_key" TEXT,
  "error_message" TEXT,
  "generated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reports_org_created_idx" ON "reports"("organization_id", "created_at");
CREATE INDEX "reports_org_status_idx" ON "reports"("organization_id", "status");
ALTER TABLE "reports" ADD CONSTRAINT "reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID,
  "type" VARCHAR(120) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "body" TEXT NOT NULL,
  "status" "notification_status" NOT NULL DEFAULT 'UNREAD',
  "payload" JSONB,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_org_status_created_idx" ON "notifications"("organization_id", "status", "created_at");
CREATE INDEX "notifications_user_status_created_idx" ON "notifications"("user_id", "status", "created_at");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "price_cents" INTEGER NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entitlements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "key" VARCHAR(120) NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "status" "subscription_status" NOT NULL DEFAULT 'INCOMPLETE',
  "provider" VARCHAR(80),
  "external_customer_id" VARCHAR(240),
  "external_subscription_id" VARCHAR(240),
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "auto_renew" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "usage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "key" VARCHAR(120) NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");
CREATE UNIQUE INDEX "entitlements_plan_key_key" ON "entitlements"("plan_id", "key");
CREATE INDEX "subscriptions_org_status_idx" ON "subscriptions"("organization_id", "status");
CREATE UNIQUE INDEX "subscriptions_provider_external_key" ON "subscriptions"("provider", "external_subscription_id");
CREATE UNIQUE INDEX "usage_org_key_period_key" ON "usage"("organization_id", "key", "period_start", "period_end");
CREATE INDEX "usage_org_key_end_idx" ON "usage"("organization_id", "key", "period_end");

ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage" ADD CONSTRAINT "usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Billing foundation is intentionally initialized without an ACTIVE subscription.
-- This prevents a missing payment provider from being represented as a paid state.
INSERT INTO "plans" ("id", "code", "name", "price_cents", "currency", "active", "updated_at")
VALUES
  (gen_random_uuid(), 'FREE', 'Базовый', 0, 'RUB', true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRO', 'Профессиональный', 0, 'RUB', true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
