import type { Prisma } from '../../generated/prisma/client.js';
import { sanitizeDelegatedPermissions, type Permission } from '../../core/rbac/permissions.js';

type DbClient = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

export type DelegatedWorkspaceAccess = {
  grantId: string;
  linkId: string;
  agencyOrganizationId: string;
  clientOrganizationId: string;
  permissions: Permission[];
  expiresAt: Date | null;
};

export type AgencyInvitationRow = {
  id: string;
  agencyOrganizationId: string;
  clientOrganizationId: string;
  granteeUserId: string;
  tokenHash: string;
  requestedPermissions: unknown;
  grantExpiresAt: Date | null;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  createdByUserId: string;
  acceptedByUserId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AgencyClientLinkRow = {
  id: string;
  agencyOrganizationId: string;
  clientOrganizationId: string;
  status: 'ACTIVE' | 'PAUSED' | 'REVOKED';
  acceptedByUserId: string;
  acceptedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DelegatedGrantRow = {
  id: string;
  agencyClientLinkId: string;
  granteeUserId: string;
  permissions: unknown;
  status: 'ACTIVE' | 'PAUSED' | 'REVOKED';
  expiresAt: Date | null;
  createdByUserId: string;
  revokedByUserId: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AgencyWorkspaceRow = DelegatedWorkspaceAccess & {
  clientName: string;
  clientSlug: string;
  agencyName: string;
};

export async function resolveDelegatedWorkspaceAccess(
  db: DbClient,
  userId: string,
  clientOrganizationId: string,
  now = new Date(),
): Promise<DelegatedWorkspaceAccess | null> {
  const rows = await db.$queryRaw<Array<{
    grantId: string;
    linkId: string;
    agencyOrganizationId: string;
    clientOrganizationId: string;
    permissions: unknown;
    expiresAt: Date | null;
  }>>`
    SELECT
      g."id" AS "grantId",
      l."id" AS "linkId",
      l."agency_organization_id" AS "agencyOrganizationId",
      l."client_organization_id" AS "clientOrganizationId",
      g."permissions" AS "permissions",
      g."expires_at" AS "expiresAt"
    FROM "delegated_access_grants" g
    JOIN "agency_client_links" l ON l."id" = g."agency_client_link_id"
    JOIN "organizations" client_org ON client_org."id" = l."client_organization_id"
    JOIN "organization_members" agency_member
      ON agency_member."organization_id" = l."agency_organization_id"
     AND agency_member."user_id" = g."grantee_user_id"
    JOIN "organizations" agency_org ON agency_org."id" = l."agency_organization_id"
    WHERE g."grantee_user_id" = CAST(${userId} AS uuid)
      AND l."client_organization_id" = CAST(${clientOrganizationId} AS uuid)
      AND g."status" = 'ACTIVE'
      AND l."status" = 'ACTIVE'
      AND client_org."status" = 'ACTIVE'
      AND agency_org."status" = 'ACTIVE'
      AND agency_member."status" = 'ACTIVE'
      AND (g."expires_at" IS NULL OR g."expires_at" > ${now})
      AND (agency_member."access_expires_at" IS NULL OR agency_member."access_expires_at" > ${now})
    ORDER BY g."updated_at" DESC
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    permissions: sanitizeDelegatedPermissions(row.permissions),
  };
}

export async function listDelegatedWorkspaces(
  db: DbClient,
  userId: string,
  now = new Date(),
): Promise<AgencyWorkspaceRow[]> {
  const rows = await db.$queryRaw<Array<Omit<AgencyWorkspaceRow, 'permissions'> & { permissions: unknown }>>`
    SELECT
      g."id" AS "grantId",
      l."id" AS "linkId",
      l."agency_organization_id" AS "agencyOrganizationId",
      l."client_organization_id" AS "clientOrganizationId",
      g."permissions" AS "permissions",
      g."expires_at" AS "expiresAt",
      client_org."name" AS "clientName",
      client_org."slug" AS "clientSlug",
      agency_org."name" AS "agencyName"
    FROM "delegated_access_grants" g
    JOIN "agency_client_links" l ON l."id" = g."agency_client_link_id"
    JOIN "organizations" client_org ON client_org."id" = l."client_organization_id"
    JOIN "organizations" agency_org ON agency_org."id" = l."agency_organization_id"
    JOIN "organization_members" agency_member
      ON agency_member."organization_id" = l."agency_organization_id"
     AND agency_member."user_id" = g."grantee_user_id"
    WHERE g."grantee_user_id" = CAST(${userId} AS uuid)
      AND g."status" = 'ACTIVE'
      AND l."status" = 'ACTIVE'
      AND client_org."status" = 'ACTIVE'
      AND agency_org."status" = 'ACTIVE'
      AND agency_member."status" = 'ACTIVE'
      AND (g."expires_at" IS NULL OR g."expires_at" > ${now})
      AND (agency_member."access_expires_at" IS NULL OR agency_member."access_expires_at" > ${now})
    ORDER BY client_org."name" ASC, g."created_at" ASC
  `;

  return rows.map((row) => ({ ...row, permissions: sanitizeDelegatedPermissions(row.permissions) }));
}

export async function revokePendingInvitations(
  db: DbClient,
  agencyOrganizationId: string,
  clientOrganizationId: string,
): Promise<void> {
  await db.$executeRaw`
    UPDATE "agency_invitations"
    SET "status" = 'REVOKED', "revoked_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
    WHERE "agency_organization_id" = CAST(${agencyOrganizationId} AS uuid)
      AND "client_organization_id" = CAST(${clientOrganizationId} AS uuid)
      AND "status" = 'PENDING'
  `;
}

export async function createInvitation(
  db: DbClient,
  input: {
    agencyOrganizationId: string;
    clientOrganizationId: string;
    granteeUserId: string;
    tokenHash: string;
    requestedPermissions: Permission[];
    grantExpiresAt: Date | null;
    createdByUserId: string;
    expiresAt: Date;
  },
): Promise<AgencyInvitationRow> {
  const permissionsJson = JSON.stringify(input.requestedPermissions);
  const rows = await db.$queryRaw<AgencyInvitationRow[]>`
    INSERT INTO "agency_invitations" (
      "agency_organization_id",
      "client_organization_id",
      "grantee_user_id",
      "token_hash",
      "requested_permissions",
      "grant_expires_at",
      "created_by_user_id",
      "expires_at"
    ) VALUES (
      CAST(${input.agencyOrganizationId} AS uuid),
      CAST(${input.clientOrganizationId} AS uuid),
      CAST(${input.granteeUserId} AS uuid),
      ${input.tokenHash},
      CAST(${permissionsJson} AS jsonb),
      ${input.grantExpiresAt},
      CAST(${input.createdByUserId} AS uuid),
      ${input.expiresAt}
    )
    RETURNING
      "id",
      "agency_organization_id" AS "agencyOrganizationId",
      "client_organization_id" AS "clientOrganizationId",
      "grantee_user_id" AS "granteeUserId",
      "token_hash" AS "tokenHash",
      "requested_permissions" AS "requestedPermissions",
      "grant_expires_at" AS "grantExpiresAt",
      "status",
      "created_by_user_id" AS "createdByUserId",
      "accepted_by_user_id" AS "acceptedByUserId",
      "expires_at" AS "expiresAt",
      "accepted_at" AS "acceptedAt",
      "revoked_at" AS "revokedAt",
      "created_at" AS "createdAt",
      "updated_at" AS "updatedAt"
  `;
  return rows[0]!;
}

export async function findInvitationByTokenHash(db: DbClient, tokenHash: string): Promise<AgencyInvitationRow | null> {
  const rows = await db.$queryRaw<AgencyInvitationRow[]>`
    SELECT
      "id",
      "agency_organization_id" AS "agencyOrganizationId",
      "client_organization_id" AS "clientOrganizationId",
      "grantee_user_id" AS "granteeUserId",
      "token_hash" AS "tokenHash",
      "requested_permissions" AS "requestedPermissions",
      "grant_expires_at" AS "grantExpiresAt",
      "status",
      "created_by_user_id" AS "createdByUserId",
      "accepted_by_user_id" AS "acceptedByUserId",
      "expires_at" AS "expiresAt",
      "accepted_at" AS "acceptedAt",
      "revoked_at" AS "revokedAt",
      "created_at" AS "createdAt",
      "updated_at" AS "updatedAt"
    FROM "agency_invitations"
    WHERE "token_hash" = ${tokenHash}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function markInvitationExpired(db: DbClient, invitationId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "agency_invitations"
    SET "status" = 'EXPIRED', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = CAST(${invitationId} AS uuid) AND "status" = 'PENDING'
  `;
}

export async function acceptInvitation(
  db: DbClient,
  invitationId: string,
  acceptedByUserId: string,
): Promise<void> {
  await db.$executeRaw`
    UPDATE "agency_invitations"
    SET
      "status" = 'ACCEPTED',
      "accepted_by_user_id" = CAST(${acceptedByUserId} AS uuid),
      "accepted_at" = CURRENT_TIMESTAMP,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = CAST(${invitationId} AS uuid) AND "status" = 'PENDING'
  `;
}

export async function upsertAgencyClientLink(
  db: DbClient,
  input: { agencyOrganizationId: string; clientOrganizationId: string; acceptedByUserId: string },
): Promise<AgencyClientLinkRow> {
  const rows = await db.$queryRaw<AgencyClientLinkRow[]>`
    INSERT INTO "agency_client_links" (
      "agency_organization_id", "client_organization_id", "accepted_by_user_id", "status"
    ) VALUES (
      CAST(${input.agencyOrganizationId} AS uuid),
      CAST(${input.clientOrganizationId} AS uuid),
      CAST(${input.acceptedByUserId} AS uuid),
      'ACTIVE'
    )
    ON CONFLICT ("agency_organization_id", "client_organization_id") DO UPDATE SET
      "status" = 'ACTIVE',
      "accepted_by_user_id" = EXCLUDED."accepted_by_user_id",
      "accepted_at" = CURRENT_TIMESTAMP,
      "revoked_at" = NULL,
      "updated_at" = CURRENT_TIMESTAMP
    RETURNING
      "id",
      "agency_organization_id" AS "agencyOrganizationId",
      "client_organization_id" AS "clientOrganizationId",
      "status",
      "accepted_by_user_id" AS "acceptedByUserId",
      "accepted_at" AS "acceptedAt",
      "revoked_at" AS "revokedAt",
      "created_at" AS "createdAt",
      "updated_at" AS "updatedAt"
  `;
  return rows[0]!;
}

export async function replaceLiveGrant(
  db: DbClient,
  input: {
    agencyClientLinkId: string;
    granteeUserId: string;
    permissions: Permission[];
    expiresAt: Date | null;
    createdByUserId: string;
  },
): Promise<DelegatedGrantRow> {
  await db.$executeRaw`
    UPDATE "delegated_access_grants"
    SET "status" = 'REVOKED', "revoked_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
    WHERE "agency_client_link_id" = CAST(${input.agencyClientLinkId} AS uuid)
      AND "grantee_user_id" = CAST(${input.granteeUserId} AS uuid)
      AND "status" IN ('ACTIVE', 'PAUSED')
  `;
  const permissionsJson = JSON.stringify(input.permissions);
  const rows = await db.$queryRaw<DelegatedGrantRow[]>`
    INSERT INTO "delegated_access_grants" (
      "agency_client_link_id", "grantee_user_id", "permissions", "expires_at", "created_by_user_id"
    ) VALUES (
      CAST(${input.agencyClientLinkId} AS uuid),
      CAST(${input.granteeUserId} AS uuid),
      CAST(${permissionsJson} AS jsonb),
      ${input.expiresAt},
      CAST(${input.createdByUserId} AS uuid)
    )
    RETURNING
      "id",
      "agency_client_link_id" AS "agencyClientLinkId",
      "grantee_user_id" AS "granteeUserId",
      "permissions",
      "status",
      "expires_at" AS "expiresAt",
      "created_by_user_id" AS "createdByUserId",
      "revoked_by_user_id" AS "revokedByUserId",
      "revoked_at" AS "revokedAt",
      "created_at" AS "createdAt",
      "updated_at" AS "updatedAt"
  `;
  return rows[0]!;
}

export async function updateLinkStatus(
  db: DbClient,
  agencyOrganizationId: string,
  linkId: string,
  status: 'ACTIVE' | 'PAUSED' | 'REVOKED',
): Promise<AgencyClientLinkRow | null> {
  const rows = await db.$queryRaw<AgencyClientLinkRow[]>`
    UPDATE "agency_client_links"
    SET
      "status" = CAST(${status} AS "agency_client_link_status"),
      "revoked_at" = CASE WHEN ${status} = 'REVOKED' THEN CURRENT_TIMESTAMP ELSE NULL END,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = CAST(${linkId} AS uuid)
      AND "agency_organization_id" = CAST(${agencyOrganizationId} AS uuid)
    RETURNING
      "id",
      "agency_organization_id" AS "agencyOrganizationId",
      "client_organization_id" AS "clientOrganizationId",
      "status",
      "accepted_by_user_id" AS "acceptedByUserId",
      "accepted_at" AS "acceptedAt",
      "revoked_at" AS "revokedAt",
      "created_at" AS "createdAt",
      "updated_at" AS "updatedAt"
  `;
  return rows[0] ?? null;
}

export async function cascadeGrantStatusForLink(
  db: DbClient,
  linkId: string,
  status: 'ACTIVE' | 'PAUSED' | 'REVOKED',
  actorUserId: string,
): Promise<void> {
  if (status === 'ACTIVE') {
    await db.$executeRaw`
      UPDATE "delegated_access_grants"
      SET "status" = 'ACTIVE', "revoked_at" = NULL, "revoked_by_user_id" = NULL, "updated_at" = CURRENT_TIMESTAMP
      WHERE "agency_client_link_id" = CAST(${linkId} AS uuid) AND "status" = 'PAUSED'
    `;
    return;
  }
  if (status === 'PAUSED') {
    await db.$executeRaw`
      UPDATE "delegated_access_grants"
      SET "status" = 'PAUSED', "updated_at" = CURRENT_TIMESTAMP
      WHERE "agency_client_link_id" = CAST(${linkId} AS uuid) AND "status" = 'ACTIVE'
    `;
    return;
  }
  await db.$executeRaw`
    UPDATE "delegated_access_grants"
    SET
      "status" = 'REVOKED',
      "revoked_by_user_id" = CAST(${actorUserId} AS uuid),
      "revoked_at" = CURRENT_TIMESTAMP,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "agency_client_link_id" = CAST(${linkId} AS uuid) AND "status" IN ('ACTIVE', 'PAUSED')
  `;
}

export async function listAgencyClientLinks(db: DbClient, agencyOrganizationId: string) {
  return db.$queryRaw<Array<AgencyClientLinkRow & { clientName: string; clientSlug: string }>>`
    SELECT
      l."id",
      l."agency_organization_id" AS "agencyOrganizationId",
      l."client_organization_id" AS "clientOrganizationId",
      l."status",
      l."accepted_by_user_id" AS "acceptedByUserId",
      l."accepted_at" AS "acceptedAt",
      l."revoked_at" AS "revokedAt",
      l."created_at" AS "createdAt",
      l."updated_at" AS "updatedAt",
      o."name" AS "clientName",
      o."slug" AS "clientSlug"
    FROM "agency_client_links" l
    JOIN "organizations" o ON o."id" = l."client_organization_id"
    WHERE l."agency_organization_id" = CAST(${agencyOrganizationId} AS uuid)
      AND l."status" IN ('ACTIVE', 'PAUSED')
      AND o."status" = 'ACTIVE'
    ORDER BY o."name" ASC, l."created_at" ASC
  `;
}
