-- Backfill deterministic reply versions before the P6-P11 migration creates
-- the uniqueness guarantee. Safe for databases that already have multiple
-- drafts/replies per review.
ALTER TABLE "review_replies"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "review_id"
    ORDER BY "created_at" ASC, "id" ASC
  ) AS rn
  FROM "review_replies"
)
UPDATE "review_replies" r
SET "version" = ranked.rn
FROM ranked
WHERE r."id" = ranked."id";

CREATE UNIQUE INDEX IF NOT EXISTS "review_replies_review_version_key"
  ON "review_replies"("review_id", "version");
