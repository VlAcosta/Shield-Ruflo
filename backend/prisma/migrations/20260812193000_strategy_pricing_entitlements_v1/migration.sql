-- Strategic pricing/entitlement catalog from the 2026-08-12 product audit.
--
-- Safety notes:
-- * FREE remains active only as a legacy/grandfathering fallback while production
--   checkout is provider-gated. It is hidden from the public catalog in application code.
-- * Existing subscriptions are not rewritten by this migration.
-- * No charge, renewal or payment-provider action is triggered here.

INSERT INTO "plans" ("id", "code", "name", "price_cents", "currency", "active", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'START', 'Start', 349000, 'RUB', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'GROWTH', 'Growth', 899000, 'RUB', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRO', 'Pro', 1899000, 'RUB', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BUSINESS', 'Business', 3990000, 'RUB', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "price_cents" = EXCLUDED."price_cents",
  "currency" = EXCLUDED."currency",
  "active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

-- FREE is retained for already-created beta workspaces, but is no longer a public plan.
INSERT INTO "entitlements" ("id", "plan_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), p."id", e."key", e."value"::jsonb, CURRENT_TIMESTAMP
FROM "plans" p
CROSS JOIN (VALUES
  ('catalog.visible', 'false'),
  ('legacy_plan', 'true')
) AS e("key", "value")
WHERE p."code" = 'FREE'
ON CONFLICT ("plan_id", "key") DO UPDATE
SET "value" = EXCLUDED."value", "updated_at" = CURRENT_TIMESTAMP;

-- START — 3 490 RUB/month.
INSERT INTO "entitlements" ("id", "plan_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), p."id", e."key", e."value"::jsonb, CURRENT_TIMESTAMP
FROM "plans" p
CROSS JOIN (VALUES
  ('catalog.visible', 'true'),
  ('catalog.order', '10'),
  ('billing.annual_discount_percent', '15'),
  ('locations.max', '1'),
  ('review_sources.max', '5'),
  ('reviews.monthly', '300'),
  ('users.max', '2'),
  ('ai_actions.monthly', '150'),
  ('retention.months', '3'),
  ('sla_workflows', '"basic"'),
  ('approval.steps', '0'),
  ('rbac.level', '"preset"'),
  ('competitors.max', '0'),
  ('automation_rules.max', '3'),
  ('api_webhooks', 'false'),
  ('managed_replies.mode', '"addon"'),
  ('custom_terms', 'false'),
  ('maxBusinesses', '1'),
  ('maxLocations', '1'),
  ('maxUsers', '2'),
  ('maxReviewSources', '5'),
  ('analytics', 'true'),
  ('automations', 'true'),
  ('reports', 'true'),
  ('competitive', 'false'),
  ('aiVisibility', 'false'),
  ('aiFeatures', 'true'),
  ('apiAccess', 'false'),
  ('agency', 'false')
) AS e("key", "value")
WHERE p."code" = 'START'
ON CONFLICT ("plan_id", "key") DO UPDATE
SET "value" = EXCLUDED."value", "updated_at" = CURRENT_TIMESTAMP;

-- GROWTH — 8 990 RUB/month, recommended for 1–3 locations.
INSERT INTO "entitlements" ("id", "plan_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), p."id", e."key", e."value"::jsonb, CURRENT_TIMESTAMP
FROM "plans" p
CROSS JOIN (VALUES
  ('catalog.visible', 'true'),
  ('catalog.order', '20'),
  ('billing.annual_discount_percent', '15'),
  ('locations.max', '3'),
  ('review_sources.max', '10'),
  ('reviews.monthly', '1500'),
  ('users.max', '5'),
  ('ai_actions.monthly', '1500'),
  ('retention.months', '12'),
  ('sla_workflows', '"standard"'),
  ('approval.steps', '1'),
  ('rbac.level', '"preset"'),
  ('competitors.max', '3'),
  ('automation_rules.max', '10'),
  ('api_webhooks', 'false'),
  ('managed_replies.mode', '"addon"'),
  ('custom_terms', 'false'),
  ('maxBusinesses', '1'),
  ('maxLocations', '3'),
  ('maxUsers', '5'),
  ('maxReviewSources', '10'),
  ('analytics', 'true'),
  ('automations', 'true'),
  ('reports', 'true'),
  ('competitive', 'true'),
  ('aiVisibility', 'false'),
  ('aiFeatures', 'true'),
  ('apiAccess', 'false'),
  ('agency', 'false')
) AS e("key", "value")
WHERE p."code" = 'GROWTH'
ON CONFLICT ("plan_id", "key") DO UPDATE
SET "value" = EXCLUDED."value", "updated_at" = CURRENT_TIMESTAMP;

-- PRO — 18 990 RUB/month for teams and 4–10 location networks.
INSERT INTO "entitlements" ("id", "plan_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), p."id", e."key", e."value"::jsonb, CURRENT_TIMESTAMP
FROM "plans" p
CROSS JOIN (VALUES
  ('catalog.visible', 'true'),
  ('catalog.order', '30'),
  ('billing.annual_discount_percent', '15'),
  ('locations.max', '10'),
  ('review_sources.max', '15'),
  ('reviews.monthly', '5000'),
  ('users.max', '15'),
  ('ai_actions.monthly', '6000'),
  ('retention.months', '24'),
  ('sla_workflows', '"advanced"'),
  ('approval.steps', '1'),
  ('rbac.level', '"advanced"'),
  ('competitors.max', '10'),
  ('automation_rules.max', '50'),
  ('api_webhooks', 'true'),
  ('managed_replies.mode', '"addon"'),
  ('custom_terms', 'false'),
  ('maxBusinesses', '1'),
  ('maxLocations', '10'),
  ('maxUsers', '15'),
  ('maxReviewSources', '15'),
  ('analytics', 'true'),
  ('automations', 'true'),
  ('reports', 'true'),
  ('competitive', 'true'),
  ('aiVisibility', 'true'),
  ('aiFeatures', 'true'),
  ('apiAccess', 'true'),
  ('agency', 'false')
) AS e("key", "value")
WHERE p."code" = 'PRO'
ON CONFLICT ("plan_id", "key") DO UPDATE
SET "value" = EXCLUDED."value", "updated_at" = CURRENT_TIMESTAMP;

-- BUSINESS — public starting price 39 900 RUB/month; negotiated expansion above base limits.
INSERT INTO "entitlements" ("id", "plan_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), p."id", e."key", e."value"::jsonb, CURRENT_TIMESTAMP
FROM "plans" p
CROSS JOIN (VALUES
  ('catalog.visible', 'true'),
  ('catalog.order', '40'),
  ('billing.annual_discount_percent', '15'),
  ('locations.max', '25'),
  ('review_sources.max', '50'),
  ('reviews.monthly', '20000'),
  ('users.max', '50'),
  ('ai_actions.monthly', '20000'),
  ('retention.months', '36'),
  ('sla_workflows', '"advanced_custom"'),
  ('approval.steps', '3'),
  ('rbac.level', '"advanced"'),
  ('competitors.max', '50'),
  ('automation_rules.max', '200'),
  ('api_webhooks', 'true'),
  ('managed_replies.mode', '"contract"'),
  ('custom_terms', 'true'),
  ('maxBusinesses', '10'),
  ('maxLocations', '25'),
  ('maxUsers', '50'),
  ('maxReviewSources', '50'),
  ('analytics', 'true'),
  ('automations', 'true'),
  ('reports', 'true'),
  ('competitive', 'true'),
  ('aiVisibility', 'true'),
  ('aiFeatures', 'true'),
  ('apiAccess', 'true'),
  ('agency', 'true')
) AS e("key", "value")
WHERE p."code" = 'BUSINESS'
ON CONFLICT ("plan_id", "key") DO UPDATE
SET "value" = EXCLUDED."value", "updated_at" = CURRENT_TIMESTAMP;
