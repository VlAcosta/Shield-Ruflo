-- P3 company profile persistence and primary-resource integrity.
--
-- This migration is additive. The new organization profile columns remain
-- nullable so existing organizations and partially completed onboarding flows
-- stay compatible. Existing values are copied from the deterministically
-- selected primary business where possible; legal_name falls back to the
-- organization's display name.
--
-- Before enforcing uniqueness, duplicate active primary flags are normalized
-- by retaining the oldest active row (UUID is the stable tie-breaker). Where
-- active rows exist but no primary is selected, the oldest active row becomes
-- primary. Archived rows are intentionally ignored by the constraints.
--
-- Rollback (schema only):
--   DROP INDEX "locations_one_active_primary_per_business_key";
--   DROP INDEX "businesses_one_active_primary_per_org_key";
--   ALTER TABLE "organizations"
--     DROP COLUMN "website",
--     DROP COLUMN "industry",
--     DROP COLUMN "legal_name";
-- Dropping the profile columns loses values written after this migration.
-- Production rollback should therefore normally be a forward application
-- change that stops using the columns while retaining their data.

BEGIN;

ALTER TABLE "organizations"
  ADD COLUMN "legal_name" VARCHAR(240),
  ADD COLUMN "industry" VARCHAR(120),
  ADD COLUMN "website" TEXT;

UPDATE "organizations"
SET "legal_name" = "name";

WITH selected_business AS (
  SELECT DISTINCT ON (business."organization_id")
    business."organization_id",
    business."name",
    business."legal_name",
    business."industry",
    business."website"
  FROM "businesses" AS business
  WHERE business."status" = 'ACTIVE'
  ORDER BY
    business."organization_id",
    business."is_primary" DESC,
    business."created_at" ASC,
    business."id" ASC
)
UPDATE "organizations" AS organization
SET
  "legal_name" = COALESCE(selected_business."legal_name", selected_business."name", organization."name"),
  "industry" = selected_business."industry",
  "website" = selected_business."website"
FROM selected_business
WHERE selected_business."organization_id" = organization."id";

-- Retain exactly one primary among currently flagged active businesses.
WITH ranked_primaries AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organization_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS primary_rank
  FROM "businesses"
  WHERE "status" = 'ACTIVE' AND "is_primary" = true
)
UPDATE "businesses" AS business
SET "is_primary" = false
FROM ranked_primaries
WHERE business."id" = ranked_primaries."id"
  AND ranked_primaries.primary_rank > 1;

-- Select a primary for every organization that has active businesses.
WITH ranked_active AS (
  SELECT
    "id",
    "organization_id",
    ROW_NUMBER() OVER (
      PARTITION BY "organization_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS active_rank
  FROM "businesses"
  WHERE "status" = 'ACTIVE'
), missing_primary AS (
  SELECT ranked_active."id"
  FROM ranked_active
  WHERE ranked_active.active_rank = 1
    AND NOT EXISTS (
      SELECT 1
      FROM "businesses" AS current_primary
      WHERE current_primary."organization_id" = ranked_active."organization_id"
        AND current_primary."status" = 'ACTIVE'
        AND current_primary."is_primary" = true
    )
)
UPDATE "businesses" AS business
SET "is_primary" = true
FROM missing_primary
WHERE business."id" = missing_primary."id";

-- Retain exactly one primary among currently flagged active locations.
WITH ranked_primaries AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "business_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS primary_rank
  FROM "locations"
  WHERE "status" = 'ACTIVE' AND "is_primary" = true
)
UPDATE "locations" AS location
SET "is_primary" = false
FROM ranked_primaries
WHERE location."id" = ranked_primaries."id"
  AND ranked_primaries.primary_rank > 1;

-- Select a primary for every business that has active locations.
WITH ranked_active AS (
  SELECT
    "id",
    "business_id",
    ROW_NUMBER() OVER (
      PARTITION BY "business_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS active_rank
  FROM "locations"
  WHERE "status" = 'ACTIVE'
), missing_primary AS (
  SELECT ranked_active."id"
  FROM ranked_active
  WHERE ranked_active.active_rank = 1
    AND NOT EXISTS (
      SELECT 1
      FROM "locations" AS current_primary
      WHERE current_primary."business_id" = ranked_active."business_id"
        AND current_primary."status" = 'ACTIVE'
        AND current_primary."is_primary" = true
    )
)
UPDATE "locations" AS location
SET "is_primary" = true
FROM missing_primary
WHERE location."id" = missing_primary."id";

CREATE UNIQUE INDEX "businesses_one_active_primary_per_org_key"
ON "businesses"("organization_id")
WHERE "is_primary" = true AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX "locations_one_active_primary_per_business_key"
ON "locations"("business_id")
WHERE "is_primary" = true AND "status" = 'ACTIVE';

COMMIT;
