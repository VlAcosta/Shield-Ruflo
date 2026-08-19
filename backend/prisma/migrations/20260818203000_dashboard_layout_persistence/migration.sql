CREATE TABLE "dashboard_layouts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "layout" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dashboard_layouts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dashboard_layouts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "dashboard_layouts_org_user_key"
  ON "dashboard_layouts"("organization_id", "user_id");

CREATE INDEX "dashboard_layouts_user_updated_idx"
  ON "dashboard_layouts"("user_id", "updated_at");

CREATE INDEX "dashboard_layouts_org_updated_idx"
  ON "dashboard_layouts"("organization_id", "updated_at");
