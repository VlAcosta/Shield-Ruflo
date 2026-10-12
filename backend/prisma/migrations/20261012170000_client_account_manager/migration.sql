ALTER TABLE "organizations"
  ADD COLUMN "account_manager_id" UUID;

CREATE INDEX "organizations_account_manager_idx"
  ON "organizations"("account_manager_id");

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_account_manager_id_fkey"
  FOREIGN KEY ("account_manager_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
