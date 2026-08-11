#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

schema_path = ROOT / 'backend/prisma/schema.prisma'
schema = schema_path.read_text(encoding='utf-8')
if 'model AgencyPortfolio {' not in schema:
    # reverse relations
    schema = schema.replace('  askShieldQueries         AskShieldQuery[]\n}', '  askShieldQueries         AskShieldQuery[]\n  agencyPortfolio          AgencyPortfolio?\n  agencyClientLinks        AgencyClientLink[] @relation("AgencyClientOrganization")\n  agencyInvitations        AgencyInvitation[] @relation("AgencyInvitationClient")\n}', 1)
    schema = schema.replace('  askShieldQueries           AskShieldQuery[]        @relation("AskShieldQueryCreator")\n', '  askShieldQueries           AskShieldQuery[]        @relation("AskShieldQueryCreator")\n  acceptedAgencyLinks        AgencyClientLink[]       @relation("AgencyLinkAcceptor")\n  createdAgencyInvitations  AgencyInvitation[]       @relation("AgencyInvitationCreator")\n  acceptedAgencyInvitations AgencyInvitation[]       @relation("AgencyInvitationAcceptor")\n', 1)
    schema += r'''

enum AgencyLinkStatus {
  ACTIVE
  PAUSED
  REVOKED
  @@map("agency_link_status")
}

enum AgencyInvitationStatus {
  PENDING
  ACCEPTED
  REVOKED
  EXPIRED
  @@map("agency_invitation_status")
}

model AgencyPortfolio {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @unique @map("organization_id") @db.Uuid
  name           String   @db.VarChar(180)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  clientLinks  AgencyClientLink[]
  invitations AgencyInvitation[]
  @@map("agency_portfolios")
}

model AgencyClientLink {
  id                   String           @id @default(uuid()) @db.Uuid
  agencyPortfolioId    String           @map("agency_portfolio_id") @db.Uuid
  clientOrganizationId String           @map("client_organization_id") @db.Uuid
  status               AgencyLinkStatus @default(ACTIVE)
  acceptedByUserId     String?          @map("accepted_by_user_id") @db.Uuid
  acceptedAt           DateTime         @default(now()) @map("accepted_at")
  createdAt            DateTime         @default(now()) @map("created_at")
  updatedAt            DateTime         @updatedAt @map("updated_at")

  agencyPortfolio    AgencyPortfolio @relation(fields: [agencyPortfolioId], references: [id], onDelete: Cascade)
  clientOrganization Organization    @relation("AgencyClientOrganization", fields: [clientOrganizationId], references: [id], onDelete: Cascade)
  acceptedBy         User?           @relation("AgencyLinkAcceptor", fields: [acceptedByUserId], references: [id], onDelete: SetNull)

  @@unique([agencyPortfolioId, clientOrganizationId], map: "agency_client_links_unique")
  @@index([clientOrganizationId, status], map: "agency_client_links_client_status_idx")
  @@map("agency_client_links")
}

model AgencyInvitation {
  id                   String                 @id @default(uuid()) @db.Uuid
  agencyPortfolioId    String                 @map("agency_portfolio_id") @db.Uuid
  clientOrganizationId String                 @map("client_organization_id") @db.Uuid
  tokenHash            String                 @unique @map("token_hash") @db.VarChar(128)
  status               AgencyInvitationStatus @default(PENDING)
  createdByUserId      String?                @map("created_by_user_id") @db.Uuid
  acceptedByUserId     String?                @map("accepted_by_user_id") @db.Uuid
  expiresAt            DateTime               @map("expires_at")
  acceptedAt           DateTime?              @map("accepted_at")
  createdAt            DateTime               @default(now()) @map("created_at")
  updatedAt            DateTime               @updatedAt @map("updated_at")

  agencyPortfolio    AgencyPortfolio @relation(fields: [agencyPortfolioId], references: [id], onDelete: Cascade)
  clientOrganization Organization    @relation("AgencyInvitationClient", fields: [clientOrganizationId], references: [id], onDelete: Cascade)
  createdBy          User?           @relation("AgencyInvitationCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)
  acceptedBy         User?           @relation("AgencyInvitationAcceptor", fields: [acceptedByUserId], references: [id], onDelete: SetNull)

  @@index([agencyPortfolioId, status, createdAt], map: "agency_invitations_portfolio_status_idx")
  @@index([clientOrganizationId, status, createdAt], map: "agency_invitations_client_status_idx")
  @@map("agency_invitations")
}
'''
    schema_path.write_text(schema, encoding='utf-8')

app_path = ROOT / 'backend/src/app.ts'
app = app_path.read_text(encoding='utf-8')
if 'agencyRoutes' not in app:
    anchor = "import { askShieldRoutes } from './modules/ask-shield/ask-shield.routes.js';\n"
    app = app.replace(anchor, anchor + "import { agencyRoutes } from './modules/agency/agency.routes.js';\n", 1)
    reg = "  await app.register(askShieldRoutes, { prefix: '/api/v1' });\n"
    app = app.replace(reg, reg + "  await app.register(agencyRoutes, { prefix: '/api/v1' });\n", 1)
    app_path.write_text(app, encoding='utf-8')

rbac_path = ROOT / 'backend/src/core/rbac/permissions.ts'
rbac = rbac_path.read_text(encoding='utf-8')
if "'agency.view'" not in rbac:
    rbac = rbac.replace("  'ai_visibility.run',\n", "  'ai_visibility.run',\n  'agency.view',\n  'agency.manage',\n", 1)
    rbac = rbac.replace("  'ai_visibility.view', 'ai_visibility.manage', 'ai_visibility.run',\n", "  'ai_visibility.view', 'ai_visibility.manage', 'ai_visibility.run',\n  'agency.view', 'agency.manage',\n", 1)
    # manager gets read access only
    rbac = rbac.replace("  'ai_visibility.view',\n  'tasks.view'", "  'ai_visibility.view',\n  'agency.view',\n  'tasks.view'", 1)
    rbac_path.write_text(rbac, encoding='utf-8')
