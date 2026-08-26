CREATE TABLE "product_suggestions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID,
  "category" VARCHAR(120) NOT NULL DEFAULT 'Другое',
  "subject" VARCHAR(240) NOT NULL DEFAULT 'Предложение по продукту',
  "message" TEXT NOT NULL,
  "contact_name" VARCHAR(180),
  "contact_email" VARCHAR(320),
  "status" VARCHAR(32) NOT NULL DEFAULT 'NEW',
  "delivery_status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "delivered_at" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_suggestions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_suggestions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_suggestions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "product_suggestions_org_created_idx"
  ON "product_suggestions"("organization_id", "created_at");
CREATE INDEX "product_suggestions_delivery_created_idx"
  ON "product_suggestions"("delivery_status", "created_at");
