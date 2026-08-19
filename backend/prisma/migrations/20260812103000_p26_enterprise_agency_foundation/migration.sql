CREATE TYPE "agency_client_link_status" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');
CREATE TYPE "agency_invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "delegated_access_grant_status" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');

CREATE TABLE "agency_client_links" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agency_organization_id" UUID NOT NULL,
  "client_organization_id" UUID NOT NULL,
  "status" "agency_client_link_status" NOT NULL DEFAULT 'ACTIVE',
  "accepted_by_user_id" UUID NOT NULL,
  "accepted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agency_client_links_agency_fk" FOREIGN KEY ("agency_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "agency_client_links_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "agency_client_links_acceptor_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "agency_client_links_not_self" CHECK ("agency_organization_id" <> "client_organization_id"),
  CONSTRAINT "agency_client_links_unique" UNIQUE ("agency_organization_id", "client_organization_id")
);

CREATE INDEX "agency_client_links_agency_status_idx"
  ON "agency_client_links"("agency_organization_id", "status", "created_at" DESC);
CREATE INDEX "agency_client_links_client_status_idx"
  ON "agency_client_links"("client_organization_id", "status", "created_at" DESC);

CREATE TABLE "agency_invitations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agency_organization_id" UUID NOT NULL,
  "client_organization_id" UUID NOT NULL,
  "grantee_user_id" UUID NOT NULL,
  "token_hash" VARCHAR(128) NOT NULL UNIQUE,
  "requested_permissions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "grant_expires_at" TIMESTAMPTZ,
  "status" "agency_invitation_status" NOT NULL DEFAULT 'PENDING',
  "created_by_user_id" UUID NOT NULL,
  "accepted_by_user_id" UUID,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "accepted_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agency_invitations_agency_fk" FOREIGN KEY ("agency_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "agency_invitations_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "agency_invitations_grantee_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "agency_invitations_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "agency_invitations_acceptor_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "agency_invitations_not_self" CHECK ("agency_organization_id" <> "client_organization_id"),
  CONSTRAINT "agency_invitations_permissions_array" CHECK (jsonb_typeof("requested_permissions") = 'array')
);

CREATE INDEX "agency_invitations_agency_status_idx"
  ON "agency_invitations"("agency_organization_id", "status", "created_at" DESC);
CREATE INDEX "agency_invitations_client_status_idx"
  ON "agency_invitations"("client_organization_id", "status", "created_at" DESC);
CREATE INDEX "agency_invitations_expiry_idx"
  ON "agency_invitations"("status", "expires_at");

CREATE TABLE "delegated_access_grants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agency_client_link_id" UUID NOT NULL,
  "grantee_user_id" UUID NOT NULL,
  "permissions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" "delegated_access_grant_status" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ,
  "created_by_user_id" UUID NOT NULL,
  "revoked_by_user_id" UUID,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delegated_access_grants_link_fk" FOREIGN KEY ("agency_client_link_id") REFERENCES "agency_client_links"("id") ON DELETE CASCADE,
  CONSTRAINT "delegated_access_grants_grantee_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "delegated_access_grants_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "delegated_access_grants_revoker_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "delegated_access_grants_permissions_array" CHECK (jsonb_typeof("permissions") = 'array')
);

CREATE INDEX "delegated_access_grants_grantee_status_idx"
  ON "delegated_access_grants"("grantee_user_id", "status", "expires_at");
CREATE INDEX "delegated_access_grants_link_status_idx"
  ON "delegated_access_grants"("agency_client_link_id", "status", "created_at" DESC);
CREATE UNIQUE INDEX "delegated_access_grants_live_unique"
  ON "delegated_access_grants"("agency_client_link_id", "grantee_user_id")
  WHERE "status" IN ('ACTIVE', 'PAUSED');
