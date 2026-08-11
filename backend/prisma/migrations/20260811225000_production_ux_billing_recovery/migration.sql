-- Production UX recovery: make the PRO catalog truthful while checkout remains provider-gated.
UPDATE "plans" SET "name" = 'Профессионал', "price_cents" = 499000, "updated_at" = CURRENT_TIMESTAMP WHERE "code" = 'PRO';
