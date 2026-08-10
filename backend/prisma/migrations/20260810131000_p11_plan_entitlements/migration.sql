-- Product entitlement catalog. Values describe server-enforced capabilities.
-- No paid subscription is created here and no payment is implied.

INSERT INTO "entitlements" ("id", "plan_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), p."id", e."key", e."value"::jsonb, CURRENT_TIMESTAMP
FROM "plans" p
CROSS JOIN (VALUES
  ('maxBusinesses', '1'),
  ('maxLocations', '3'),
  ('maxUsers', '5'),
  ('maxReviewSources', '5'),
  ('analytics', 'true'),
  ('automations', 'true'),
  ('reports', 'true'),
  ('apiAccess', 'false')
) AS e("key", "value")
WHERE p."code" = 'FREE'
ON CONFLICT ("plan_id", "key") DO NOTHING;

INSERT INTO "entitlements" ("id", "plan_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), p."id", e."key", e."value"::jsonb, CURRENT_TIMESTAMP
FROM "plans" p
CROSS JOIN (VALUES
  ('maxBusinesses', '50'),
  ('maxLocations', '250'),
  ('maxUsers', '100'),
  ('maxReviewSources', '250'),
  ('analytics', 'true'),
  ('automations', 'true'),
  ('reports', 'true'),
  ('apiAccess', 'true')
) AS e("key", "value")
WHERE p."code" = 'PRO'
ON CONFLICT ("plan_id", "key") DO NOTHING;
