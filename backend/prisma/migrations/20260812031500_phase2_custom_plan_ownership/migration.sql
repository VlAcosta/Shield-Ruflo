-- Business Shield Phase 2: custom billing plans belong to their organization.
-- Global catalog plans (FREE/PRO) keep organization_id = NULL.

ALTER TABLE "plans" ADD COLUMN "organization_id" UUID;

CREATE INDEX "plans_organization_idx" ON "plans"("organization_id");

ALTER TABLE "plans"
  ADD CONSTRAINT "plans_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
