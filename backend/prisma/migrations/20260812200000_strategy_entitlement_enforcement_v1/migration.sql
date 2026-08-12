-- Strategy P0: race-safe server enforcement for expansion-resource quotas.
--
-- Monthly review and AI meters intentionally remain warning/grace meters: critical
-- reputation workflows must not be disabled mid-incident. Hard caps apply only to
-- resource expansion: locations, review sources, active users, enabled automations
-- and active competitors.
--
-- Legacy FREE is deliberately grandfathered and is not hard-capped by these
-- triggers. Only the public START/GROWTH/PRO/BUSINESS plans are enforced here.

CREATE OR REPLACE FUNCTION "bs_plan_limit"(
  p_organization_id UUID,
  p_key TEXT,
  p_legacy_key TEXT DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan_id UUID;
  v_plan_code TEXT;
  v_value JSONB;
BEGIN
  SELECT s."plan_id", p."code"
    INTO v_plan_id, v_plan_code
  FROM "subscriptions" s
  JOIN "plans" p ON p."id" = s."plan_id"
  WHERE s."organization_id" = p_organization_id
    AND s."status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE')
    AND (
      s."status" <> 'TRIALING'
      OR s."current_period_end" IS NULL
      OR s."current_period_end" > CURRENT_TIMESTAMP
    )
  ORDER BY s."created_at" DESC
  LIMIT 1;

  IF v_plan_id IS NULL OR v_plan_code NOT IN ('START', 'GROWTH', 'PRO', 'BUSINESS') THEN
    RETURN NULL;
  END IF;

  SELECT e."value" INTO v_value
  FROM "entitlements" e
  WHERE e."plan_id" = v_plan_id AND e."key" = p_key
  LIMIT 1;

  IF v_value IS NULL AND p_legacy_key IS NOT NULL THEN
    SELECT e."value" INTO v_value
    FROM "entitlements" e
    WHERE e."plan_id" = v_plan_id AND e."key" = p_legacy_key
    LIMIT 1;
  END IF;

  IF v_value IS NULL OR jsonb_typeof(v_value) <> 'number' THEN
    RETURN NULL;
  END IF;

  RETURN (v_value #>> '{}')::INTEGER;
END;
$$;

CREATE OR REPLACE FUNCTION "bs_raise_if_plan_limit_reached"(
  p_organization_id UUID,
  p_key TEXT,
  p_legacy_key TEXT,
  p_used INTEGER,
  p_increment INTEGER DEFAULT 1
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit INTEGER;
  v_plan_code TEXT;
BEGIN
  v_limit := "bs_plan_limit"(p_organization_id, p_key, p_legacy_key);
  IF v_limit IS NULL OR v_limit < 0 OR p_used + p_increment <= v_limit THEN
    RETURN;
  END IF;

  SELECT p."code" INTO v_plan_code
  FROM "subscriptions" s
  JOIN "plans" p ON p."id" = s."plan_id"
  WHERE s."organization_id" = p_organization_id
    AND s."status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE')
  ORDER BY s."created_at" DESC
  LIMIT 1;

  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'PLAN_LIMIT_REACHED',
    DETAIL = json_build_object(
      'organizationId', p_organization_id,
      'plan', v_plan_code,
      'entitlement', p_key,
      'used', p_used,
      'requestedIncrement', p_increment,
      'limit', v_limit,
      'upgradeRequired', true
    )::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION "bs_enforce_location_limit"() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_organization_id UUID;
  v_used INTEGER;
BEGIN
  IF NEW."status" <> 'ACTIVE' THEN RETURN NEW; END IF;
  SELECT b."organization_id" INTO v_organization_id FROM "businesses" b WHERE b."id" = NEW."business_id";
  IF v_organization_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bs-plan-limit:' || v_organization_id::TEXT || ':locations.max', 0));
  SELECT COUNT(*) INTO v_used
  FROM "locations" l
  JOIN "businesses" b ON b."id" = l."business_id"
  WHERE b."organization_id" = v_organization_id
    AND b."status" = 'ACTIVE'
    AND l."status" = 'ACTIVE'
    AND l."id" <> NEW."id";
  PERFORM "bs_raise_if_plan_limit_reached"(v_organization_id, 'locations.max', 'maxLocations', v_used, 1);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "bs_enforce_review_source_limit"() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_used INTEGER;
BEGIN
  IF NEW."status" <> 'ACTIVE' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bs-plan-limit:' || NEW."organization_id"::TEXT || ':review_sources.max', 0));
  SELECT COUNT(*) INTO v_used FROM "review_sources"
  WHERE "organization_id" = NEW."organization_id" AND "status" = 'ACTIVE' AND "id" <> NEW."id";
  PERFORM "bs_raise_if_plan_limit_reached"(NEW."organization_id", 'review_sources.max', 'maxReviewSources', v_used, 1);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "bs_enforce_user_limit"() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_used INTEGER;
BEGIN
  IF NEW."status" <> 'ACTIVE' OR (NEW."access_expires_at" IS NOT NULL AND NEW."access_expires_at" <= CURRENT_TIMESTAMP) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bs-plan-limit:' || NEW."organization_id"::TEXT || ':users.max', 0));
  SELECT COUNT(*) INTO v_used FROM "organization_members"
  WHERE "organization_id" = NEW."organization_id"
    AND "status" = 'ACTIVE'
    AND ("access_expires_at" IS NULL OR "access_expires_at" > CURRENT_TIMESTAMP)
    AND "id" <> NEW."id";
  PERFORM "bs_raise_if_plan_limit_reached"(NEW."organization_id", 'users.max', 'maxUsers', v_used, 1);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "bs_enforce_automation_limit"() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_used INTEGER;
BEGIN
  IF NEW."enabled" IS NOT TRUE THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bs-plan-limit:' || NEW."organization_id"::TEXT || ':automation_rules.max', 0));
  SELECT COUNT(*) INTO v_used FROM "automations"
  WHERE "organization_id" = NEW."organization_id" AND "enabled" = true AND "id" <> NEW."id";
  PERFORM "bs_raise_if_plan_limit_reached"(NEW."organization_id", 'automation_rules.max', NULL, v_used, 1);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "bs_enforce_competitor_limit"() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_used INTEGER;
BEGIN
  IF NEW."status" <> 'ACTIVE' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bs-plan-limit:' || NEW."organization_id"::TEXT || ':competitors.max', 0));
  SELECT COUNT(*) INTO v_used FROM "competitive_competitors"
  WHERE "organization_id" = NEW."organization_id" AND "status" = 'ACTIVE' AND "id" <> NEW."id";
  PERFORM "bs_raise_if_plan_limit_reached"(NEW."organization_id", 'competitors.max', NULL, v_used, 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "locations_plan_limit_insert" ON "locations";
CREATE TRIGGER "locations_plan_limit_insert"
BEFORE INSERT ON "locations"
FOR EACH ROW EXECUTE FUNCTION "bs_enforce_location_limit"();

DROP TRIGGER IF EXISTS "locations_plan_limit_update" ON "locations";
CREATE TRIGGER "locations_plan_limit_update"
BEFORE UPDATE OF "status", "business_id" ON "locations"
FOR EACH ROW
WHEN (NEW."status" = 'ACTIVE' AND (OLD."status" IS DISTINCT FROM NEW."status" OR OLD."business_id" IS DISTINCT FROM NEW."business_id"))
EXECUTE FUNCTION "bs_enforce_location_limit"();

DROP TRIGGER IF EXISTS "review_sources_plan_limit_insert" ON "review_sources";
CREATE TRIGGER "review_sources_plan_limit_insert"
BEFORE INSERT ON "review_sources"
FOR EACH ROW EXECUTE FUNCTION "bs_enforce_review_source_limit"();

DROP TRIGGER IF EXISTS "review_sources_plan_limit_update" ON "review_sources";
CREATE TRIGGER "review_sources_plan_limit_update"
BEFORE UPDATE OF "status", "organization_id" ON "review_sources"
FOR EACH ROW
WHEN (NEW."status" = 'ACTIVE' AND (OLD."status" IS DISTINCT FROM NEW."status" OR OLD."organization_id" IS DISTINCT FROM NEW."organization_id"))
EXECUTE FUNCTION "bs_enforce_review_source_limit"();

DROP TRIGGER IF EXISTS "organization_members_plan_limit_insert" ON "organization_members";
CREATE TRIGGER "organization_members_plan_limit_insert"
BEFORE INSERT ON "organization_members"
FOR EACH ROW EXECUTE FUNCTION "bs_enforce_user_limit"();

DROP TRIGGER IF EXISTS "organization_members_plan_limit_update" ON "organization_members";
CREATE TRIGGER "organization_members_plan_limit_update"
BEFORE UPDATE OF "status", "access_expires_at", "organization_id" ON "organization_members"
FOR EACH ROW
WHEN (
  NEW."status" = 'ACTIVE'
  AND (
    OLD."status" IS DISTINCT FROM NEW."status"
    OR OLD."access_expires_at" IS DISTINCT FROM NEW."access_expires_at"
    OR OLD."organization_id" IS DISTINCT FROM NEW."organization_id"
  )
)
EXECUTE FUNCTION "bs_enforce_user_limit"();

DROP TRIGGER IF EXISTS "automations_plan_limit_insert" ON "automations";
CREATE TRIGGER "automations_plan_limit_insert"
BEFORE INSERT ON "automations"
FOR EACH ROW EXECUTE FUNCTION "bs_enforce_automation_limit"();

DROP TRIGGER IF EXISTS "automations_plan_limit_update" ON "automations";
CREATE TRIGGER "automations_plan_limit_update"
BEFORE UPDATE OF "enabled", "organization_id" ON "automations"
FOR EACH ROW
WHEN (NEW."enabled" = true AND (OLD."enabled" IS DISTINCT FROM NEW."enabled" OR OLD."organization_id" IS DISTINCT FROM NEW."organization_id"))
EXECUTE FUNCTION "bs_enforce_automation_limit"();

DROP TRIGGER IF EXISTS "competitive_competitors_plan_limit_insert" ON "competitive_competitors";
CREATE TRIGGER "competitive_competitors_plan_limit_insert"
BEFORE INSERT ON "competitive_competitors"
FOR EACH ROW EXECUTE FUNCTION "bs_enforce_competitor_limit"();

DROP TRIGGER IF EXISTS "competitive_competitors_plan_limit_update" ON "competitive_competitors";
CREATE TRIGGER "competitive_competitors_plan_limit_update"
BEFORE UPDATE OF "status", "organization_id" ON "competitive_competitors"
FOR EACH ROW
WHEN (NEW."status" = 'ACTIVE' AND (OLD."status" IS DISTINCT FROM NEW."status" OR OLD."organization_id" IS DISTINCT FROM NEW."organization_id"))
EXECUTE FUNCTION "bs_enforce_competitor_limit"();