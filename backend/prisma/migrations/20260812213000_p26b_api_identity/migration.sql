CREATE TYPE "service_account_status" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "service_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(500),
  "status" "service_account_status" NOT NULL DEFAULT 'ACTIVE',
  "permissions" JSONB NOT NULL,
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_accounts_expiry_check" CHECK ("expires_at" IS NULL OR "expires_at" > "created_at"),
  CONSTRAINT "service_accounts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_accounts_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "service_accounts_org_status_idx"
  ON "service_accounts"("organization_id", "status");
CREATE INDEX "service_accounts_expires_idx"
  ON "service_accounts"("expires_at");

CREATE TABLE "service_account_api_keys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "service_account_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "prefix" VARCHAR(24) NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "permissions" JSONB NOT NULL,
  "expires_at" TIMESTAMP(3),
  "last_used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_account_api_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_account_api_keys_prefix_key" UNIQUE ("prefix"),
  CONSTRAINT "service_account_api_keys_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "service_account_api_keys_expiry_check" CHECK ("expires_at" IS NULL OR "expires_at" > "created_at"),
  CONSTRAINT "service_account_api_keys_service_account_id_fkey"
    FOREIGN KEY ("service_account_id") REFERENCES "service_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_account_api_keys_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "service_account_api_keys_org_revoked_idx"
  ON "service_account_api_keys"("organization_id", "revoked_at");
CREATE INDEX "service_account_api_keys_account_revoked_idx"
  ON "service_account_api_keys"("service_account_id", "revoked_at");
CREATE INDEX "service_account_api_keys_expires_idx"
  ON "service_account_api_keys"("expires_at");

CREATE OR REPLACE FUNCTION "bs_assert_service_account_api_key_org_match"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  account_org UUID;
BEGIN
  SELECT "organization_id" INTO account_org
  FROM "service_accounts"
  WHERE "id" = NEW."service_account_id";

  IF account_org IS NULL OR account_org <> NEW."organization_id" THEN
    RAISE EXCEPTION 'SERVICE_ACCOUNT_ORGANIZATION_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "service_account_api_keys_org_match"
BEFORE INSERT OR UPDATE OF "service_account_id", "organization_id"
ON "service_account_api_keys"
FOR EACH ROW
EXECUTE FUNCTION "bs_assert_service_account_api_key_org_match"();
