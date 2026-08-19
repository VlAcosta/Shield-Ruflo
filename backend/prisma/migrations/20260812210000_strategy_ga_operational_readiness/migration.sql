CREATE TABLE "operational_rate_limit_buckets" (
    "key" VARCHAR(255) NOT NULL,
    "scope" VARCHAR(32) NOT NULL,
    "organization_id" UUID,
    "user_id" UUID,
    "window_started_at" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_rate_limit_buckets_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "operational_rate_limit_buckets_count_check" CHECK ("count" >= 0),
    CONSTRAINT "operational_rate_limit_buckets_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "operational_rate_limit_buckets_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "operational_rate_limit_buckets_org_window_idx"
  ON "operational_rate_limit_buckets"("organization_id", "window_started_at");

CREATE INDEX "operational_rate_limit_buckets_user_window_idx"
  ON "operational_rate_limit_buckets"("user_id", "window_started_at");
