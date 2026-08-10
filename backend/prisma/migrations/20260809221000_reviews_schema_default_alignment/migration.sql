-- Align the unmodified B6 reviews migration with Prisma's UUID defaults.
-- This is additive and safe for existing rows: it changes only defaults used
-- for future inserts. Rollback is `ALTER COLUMN id DROP DEFAULT` on each table.

ALTER TABLE "review_sources" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "review_authors" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "reviews" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "review_tags" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "review_replies" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "review_assignments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
