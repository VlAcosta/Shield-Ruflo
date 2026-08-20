CREATE TABLE "calendar_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "event_date" DATE NOT NULL,
  "event_time" VARCHAR(5) NOT NULL,
  "type" VARCHAR(24) NOT NULL,
  "tone" VARCHAR(24) NOT NULL,
  "note" TEXT,
  "idempotency_key" VARCHAR(128),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_events_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "calendar_events_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "calendar_events_time_format" CHECK ("event_time" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "calendar_events_type_allowed" CHECK ("type" IN ('work', 'report', 'meeting', 'deadline', 'sla')),
  CONSTRAINT "calendar_events_tone_allowed" CHECK ("tone" IN ('violet', 'cyan', 'green', 'orange', 'red'))
);

CREATE UNIQUE INDEX "calendar_events_org_idempotency_key"
  ON "calendar_events"("organization_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX "calendar_events_org_date_idx"
  ON "calendar_events"("organization_id", "event_date");

CREATE INDEX "calendar_events_org_created_idx"
  ON "calendar_events"("organization_id", "created_at" DESC);
