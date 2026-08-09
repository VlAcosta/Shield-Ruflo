-- B6 Reviews Core: tenant-scoped review sources, authors, reviews, tags, replies and assignments.

CREATE TYPE "review_source_status" AS ENUM ('ACTIVE', 'PAUSED', 'DISCONNECTED');
CREATE TYPE "review_status" AS ENUM ('NEW', 'DEFERRED', 'DONE', 'ARCHIVED');
CREATE TYPE "review_workflow_status" AS ENUM ('INBOX', 'DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED');
CREATE TYPE "review_reply_status" AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'FAILED');
CREATE TYPE "review_assignment_status" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');

CREATE TABLE "review_sources" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "business_id" UUID NOT NULL,
  "location_id" UUID,
  "provider" VARCHAR(80) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "external_account_id" VARCHAR(240),
  "external_url" TEXT,
  "status" "review_source_status" NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "last_synced_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_authors" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "external_id" VARCHAR(240) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "avatar_url" TEXT,
  "profile_url" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_authors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reviews" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "business_id" UUID NOT NULL,
  "location_id" UUID,
  "source_id" UUID NOT NULL,
  "author_id" UUID,
  "external_id" VARCHAR(240) NOT NULL,
  "rating" INTEGER NOT NULL,
  "title" VARCHAR(300),
  "text" TEXT NOT NULL,
  "language" VARCHAR(16),
  "status" "review_status" NOT NULL DEFAULT 'NEW',
  "workflow_status" "review_workflow_status" NOT NULL DEFAULT 'INBOX',
  "source_url" TEXT,
  "published_at" TIMESTAMP(3),
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "replied_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reviews_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5)
);

CREATE TABLE "review_tags" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "color" VARCHAR(32),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_tag_links" (
  "review_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  CONSTRAINT "review_tag_links_pkey" PRIMARY KEY ("review_id", "tag_id")
);

CREATE TABLE "review_replies" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "review_id" UUID NOT NULL,
  "author_user_id" UUID,
  "text" TEXT NOT NULL,
  "status" "review_reply_status" NOT NULL DEFAULT 'DRAFT',
  "external_id" VARCHAR(240),
  "failed_reason" TEXT,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_replies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_assignments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "review_id" UUID NOT NULL,
  "organization_member_id" UUID NOT NULL,
  "assigned_by_user_id" UUID,
  "status" "review_assignment_status" NOT NULL DEFAULT 'ACTIVE',
  "note" VARCHAR(500),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "review_sources_org_status_idx" ON "review_sources"("organization_id", "status");
CREATE INDEX "review_sources_business_status_idx" ON "review_sources"("business_id", "status");
CREATE INDEX "review_sources_location_idx" ON "review_sources"("location_id");

CREATE INDEX "review_authors_org_name_idx" ON "review_authors"("organization_id", "name");
CREATE UNIQUE INDEX "review_authors_source_external_key" ON "review_authors"("source_id", "external_id");

CREATE UNIQUE INDEX "reviews_source_external_key" ON "reviews"("source_id", "external_id");
CREATE INDEX "reviews_org_status_received_idx" ON "reviews"("organization_id", "status", "received_at");
CREATE INDEX "reviews_org_workflow_received_idx" ON "reviews"("organization_id", "workflow_status", "received_at");
CREATE INDEX "reviews_business_received_idx" ON "reviews"("business_id", "received_at");
CREATE INDEX "reviews_location_received_idx" ON "reviews"("location_id", "received_at");
CREATE INDEX "reviews_source_received_idx" ON "reviews"("source_id", "received_at");
CREATE INDEX "reviews_rating_received_idx" ON "reviews"("rating", "received_at");

CREATE UNIQUE INDEX "review_tags_org_slug_key" ON "review_tags"("organization_id", "slug");
CREATE INDEX "review_tags_org_name_idx" ON "review_tags"("organization_id", "name");
CREATE INDEX "review_tag_links_tag_review_idx" ON "review_tag_links"("tag_id", "review_id");
CREATE INDEX "review_replies_review_created_idx" ON "review_replies"("review_id", "created_at");
CREATE INDEX "review_replies_org_status_created_idx" ON "review_replies"("organization_id", "status", "created_at");
CREATE UNIQUE INDEX "review_assignments_review_member_key" ON "review_assignments"("review_id", "organization_member_id");
CREATE INDEX "review_assignments_org_status_created_idx" ON "review_assignments"("organization_id", "status", "created_at");
CREATE INDEX "review_assignments_member_status_idx" ON "review_assignments"("organization_member_id", "status");

ALTER TABLE "review_sources" ADD CONSTRAINT "review_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_sources" ADD CONSTRAINT "review_sources_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_sources" ADD CONSTRAINT "review_sources_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "review_authors" ADD CONSTRAINT "review_authors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_authors" ADD CONSTRAINT "review_authors_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "review_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "review_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "review_authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "review_tags" ADD CONSTRAINT "review_tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_tag_links" ADD CONSTRAINT "review_tag_links_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_tag_links" ADD CONSTRAINT "review_tag_links_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "review_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_organization_member_id_fkey" FOREIGN KEY ("organization_member_id") REFERENCES "organization_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "_service_metadata" ("key", "value", "created_at", "updated_at")
VALUES ('reviews_core', '{"stage":"B6","schemaVersion":1,"tenantScoped":true,"providerSync":"deferred"}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "value" = EXCLUDED."value", "updated_at" = CURRENT_TIMESTAMP;
