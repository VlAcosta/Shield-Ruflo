CREATE TABLE "support_attachments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "content" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "support_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_attachments_org_created_idx"
  ON "support_attachments"("organization_id", "created_at");

CREATE INDEX "support_attachments_message_created_idx"
  ON "support_attachments"("message_id", "created_at");

ALTER TABLE "support_attachments"
  ADD CONSTRAINT "support_attachments_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "support_messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
