CREATE TYPE "agency_link_status" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');
CREATE TYPE "agency_invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "agency_portfolios" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL UNIQUE,
  "name" VARCHAR(180) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agency_portfolios_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE TABLE "agency_client_links" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agency_portfolio_id" UUID NOT NULL,
  "client_organization_id" UUID NOT NULL,
  "status" "agency_link_status" NOT NULL DEFAULT 'ACTIVE',
  "accepted_by_user_id" UUID,
  "accepted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agency_client_links_portfolio_fk" FOREIGN KEY ("agency_portfolio_id") REFERENCES "agency_portfolios"("id") ON DELETE CASCADE,
  CONSTRAINT "agency_client_links_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "agency_client_links_user_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "agency_client_links_unique" UNIQUE ("agency_portfolio_id", "client_organization_id")
);
CREATE INDEX "agency_client_links_client_status_idx" ON "agency_client_links"("client_organization_id", "status");

CREATE TABLE "agency_invitations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agency_portfolio_id" UUID NOT NULL,
  "client_organization_id" UUID NOT NULL,
  "token_hash" VARCHAR(128) NOT NULL UNIQUE,
  "status" "agency_invitation_status" NOT NULL DEFAULT 'PENDING',
  "created_by_user_id" UUID,
  "accepted_by_user_id" UUID,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "accepted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agency_invitations_portfolio_fk" FOREIGN KEY ("agency_portfolio_id") REFERENCES "agency_portfolios"("id") ON DELETE CASCADE,
  CONSTRAINT "agency_invitations_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "agency_invitations_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "agency_invitations_acceptor_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX "agency_invitations_portfolio_status_idx" ON "agency_invitations"("agency_portfolio_id", "status", "created_at" DESC);
CREATE INDEX "agency_invitations_client_status_idx" ON "agency_invitations"("client_organization_id", "status", "created_at" DESC);
