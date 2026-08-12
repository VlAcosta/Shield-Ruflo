-- Phase 2 product packaging: make plan capabilities commercially meaningful.
-- Core reputation work remains available on FREE; advanced intelligence and
-- automation capabilities require PRO. Existing subscriptions are preserved.

INSERT INTO "entitlements" ("id", "plan_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), p."id", e."key", e."value"::jsonb, CURRENT_TIMESTAMP
FROM "plans" p
CROSS JOIN (VALUES
  ('analytics', 'false'),
  ('automations', 'false'),
  ('reports', 'false'),
  ('competitive', 'false'),
  ('aiVisibility', 'false'),
  ('aiFeatures', 'false')
) AS e("key", "value")
WHERE p."code" = 'FREE'
ON CONFLICT ("plan_id", "key")
DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "entitlements" ("id", "plan_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), p."id", e."key", e."value"::jsonb, CURRENT_TIMESTAMP
FROM "plans" p
CROSS JOIN (VALUES
  ('analytics', 'true'),
  ('automations', 'true'),
  ('reports', 'true'),
  ('competitive', 'true'),
  ('aiVisibility', 'true'),
  ('aiFeatures', 'true')
) AS e("key", "value")
WHERE p."code" = 'PRO'
ON CONFLICT ("plan_id", "key")
DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = CURRENT_TIMESTAMP;
