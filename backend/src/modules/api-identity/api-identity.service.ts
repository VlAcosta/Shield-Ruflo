import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import {
  apiKeyPermissionAllowlist,
  sanitizeApiKeyPermissions,
  type Permission,
} from '../../core/rbac/permissions.js';
import { assertEntitlement } from '../billing/billing.service.js';
import { createOpaqueToken, hashSessionToken } from '../../shared/security/tokens.js';

const API_KEY_TOKEN_PREFIX = 'bsk_live';

function auditContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
  };
}

function parseFutureDate(value: string | undefined, field: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date <= new Date()) {
    throw new AppError({
      code: 'SERVICE_ACCOUNT_EXPIRY_INVALID',
      message: 'Срок действия должен быть в будущем',
      statusCode: 400,
      details: { field },
    });
  }
  return date;
}

function validatedPermissions(value: string[]): Permission[] {
  const unique = [...new Set(value)];
  const sanitized = sanitizeApiKeyPermissions(unique);
  if (sanitized.length !== unique.length) {
    const allowed = new Set<string>(apiKeyPermissionAllowlist);
    throw new AppError({
      code: 'API_KEY_SCOPE_NOT_ALLOWED',
      message: 'Один или несколько API scope недоступны для service account',
      statusCode: 400,
      details: { rejected: unique.filter((permission) => !allowed.has(permission)) },
    });
  }
  return sanitized;
}

function assertSubset(requested: Permission[], accountPermissions: Permission[]): void {
  const accountSet = new Set(accountPermissions);
  const rejected = requested.filter((permission) => !accountSet.has(permission));
  if (rejected.length) {
    throw new AppError({
      code: 'API_KEY_SCOPE_EXCEEDS_ACCOUNT',
      message: 'Ключ не может иметь больше прав, чем service account',
      statusCode: 400,
      details: { rejected },
    });
  }
}

function assertKeyExpiryWithinAccount(keyExpiresAt: Date | null, accountExpiresAt: Date | null): void {
  if (keyExpiresAt && accountExpiresAt && keyExpiresAt > accountExpiresAt) {
    throw new AppError({
      code: 'API_KEY_EXPIRY_EXCEEDS_ACCOUNT',
      message: 'Срок действия ключа не может превышать срок service account',
      statusCode: 400,
    });
  }
}

function issueToken() {
  const prefix = randomBytes(8).toString('hex');
  const secret = createOpaqueToken();
  const token = `${API_KEY_TOKEN_PREFIX}_${prefix}_${secret}`;
  return { prefix, token, tokenHash: hashSessionToken(token) };
}

function presentKey(key: {
  id: string;
  name: string;
  prefix: string;
  permissions: unknown;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    permissions: sanitizeApiKeyPermissions(key.permissions),
    expiresAt: key.expiresAt?.toISOString() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  };
}

function presentAccount(account: {
  id: string;
  name: string;
  description: string | null;
  status: string;
  permissions: unknown;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  apiKeys?: Array<{
    id: string;
    name: string;
    prefix: string;
    permissions: unknown;
    expiresAt: Date | null;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: account.id,
    name: account.name,
    description: account.description,
    status: account.status.toLowerCase(),
    permissions: sanitizeApiKeyPermissions(account.permissions),
    expiresAt: account.expiresAt?.toISOString() ?? null,
    revokedAt: account.revokedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
    keys: (account.apiKeys ?? []).map(presentKey),
  };
}

async function requireHumanContext(request: FastifyRequest) {
  const auth = request.auth;
  if (!auth?.organizationId || !auth.userId || auth.accessMode !== 'DIRECT') {
    throw new AppError({
      code: 'SERVICE_ACCOUNT_HUMAN_CONTEXT_REQUIRED',
      message: 'Управлять service account можно только из прямого пользовательского рабочего пространства',
      statusCode: 403,
    });
  }
  return { organizationId: auth.organizationId, userId: auth.userId };
}

async function requireAccount(app: FastifyInstance, organizationId: string, serviceAccountId: string) {
  const account = await app.prisma.serviceAccount.findFirst({
    where: { id: serviceAccountId, organizationId },
    include: { apiKeys: { orderBy: { createdAt: 'desc' } } },
  });
  if (!account) {
    throw new AppError({ code: 'SERVICE_ACCOUNT_NOT_FOUND', message: 'Service account не найден', statusCode: 404 });
  }
  return account;
}

export async function listServiceAccounts(app: FastifyInstance, request: FastifyRequest) {
  const { organizationId } = await requireHumanContext(request);
  await assertEntitlement(app, organizationId, 'apiAccess');
  const accounts = await app.prisma.serviceAccount.findMany({
    where: { organizationId },
    include: { apiKeys: { orderBy: { createdAt: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return { items: accounts.map(presentAccount), allowedPermissions: [...apiKeyPermissionAllowlist] };
}

export async function createServiceAccount(
  app: FastifyInstance,
  request: FastifyRequest,
  input: {
    name: string;
    description?: string;
    permissions: string[];
    expiresAt?: string;
    initialKeyName: string;
    initialKeyExpiresAt?: string;
  },
) {
  const { organizationId, userId } = await requireHumanContext(request);
  await assertEntitlement(app, organizationId, 'apiAccess');
  const permissions = validatedPermissions(input.permissions);
  const accountExpiresAt = parseFutureDate(input.expiresAt, 'expiresAt');
  const keyExpiresAt = parseFutureDate(input.initialKeyExpiresAt, 'initialKeyExpiresAt');
  assertKeyExpiryWithinAccount(keyExpiresAt, accountExpiresAt);
  const issued = issueToken();

  const result = await app.prisma.$transaction(async (tx) => {
    const account = await tx.serviceAccount.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description || null,
        permissions,
        expiresAt: accountExpiresAt,
        createdByUserId: userId,
      },
    });
    const key = await tx.serviceAccountApiKey.create({
      data: {
        serviceAccountId: account.id,
        organizationId,
        name: input.initialKeyName,
        prefix: issued.prefix,
        tokenHash: issued.tokenHash,
        permissions,
        expiresAt: keyExpiresAt,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: 'service_account.created',
        entityType: 'service_account',
        entityId: account.id,
        metadata: { permissions, expiresAt: accountExpiresAt?.toISOString() ?? null, initialKeyPrefix: issued.prefix },
        ...auditContext(request),
      },
    });
    return { account, key };
  });

  return {
    serviceAccount: presentAccount({ ...result.account, apiKeys: [result.key] }),
    apiKey: { ...presentKey(result.key), token: issued.token },
  };
}

export async function createServiceAccountKey(
  app: FastifyInstance,
  request: FastifyRequest,
  serviceAccountId: string,
  input: { name: string; permissions?: string[]; expiresAt?: string },
) {
  const { organizationId, userId } = await requireHumanContext(request);
  await assertEntitlement(app, organizationId, 'apiAccess');
  const account = await requireAccount(app, organizationId, serviceAccountId);
  if (account.status !== 'ACTIVE' || account.revokedAt || (account.expiresAt && account.expiresAt <= new Date())) {
    throw new AppError({ code: 'SERVICE_ACCOUNT_INACTIVE', message: 'Service account неактивен', statusCode: 409 });
  }
  const accountPermissions = sanitizeApiKeyPermissions(account.permissions);
  const permissions = input.permissions ? validatedPermissions(input.permissions) : accountPermissions;
  assertSubset(permissions, accountPermissions);
  const expiresAt = parseFutureDate(input.expiresAt, 'expiresAt');
  assertKeyExpiryWithinAccount(expiresAt, account.expiresAt);
  const issued = issueToken();

  const key = await app.prisma.$transaction(async (tx) => {
    const created = await tx.serviceAccountApiKey.create({
      data: {
        serviceAccountId,
        organizationId,
        name: input.name,
        prefix: issued.prefix,
        tokenHash: issued.tokenHash,
        permissions,
        expiresAt,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: 'service_account.api_key.created',
        entityType: 'service_account_api_key',
        entityId: created.id,
        metadata: { serviceAccountId, prefix: issued.prefix, permissions, expiresAt: expiresAt?.toISOString() ?? null },
        ...auditContext(request),
      },
    });
    return created;
  });

  return { apiKey: { ...presentKey(key), token: issued.token } };
}

export async function revokeServiceAccountKey(
  app: FastifyInstance,
  request: FastifyRequest,
  serviceAccountId: string,
  apiKeyId: string,
) {
  const { organizationId, userId } = await requireHumanContext(request);
  await assertEntitlement(app, organizationId, 'apiAccess');
  await requireAccount(app, organizationId, serviceAccountId);

  const result = await app.prisma.$transaction(async (tx) => {
    const key = await tx.serviceAccountApiKey.findFirst({
      where: { id: apiKeyId, serviceAccountId, organizationId },
    });
    if (!key) throw new AppError({ code: 'API_KEY_NOT_FOUND', message: 'API key не найден', statusCode: 404 });
    if (key.revokedAt) return key;
    const revoked = await tx.serviceAccountApiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: 'service_account.api_key.revoked',
        entityType: 'service_account_api_key',
        entityId: key.id,
        metadata: { serviceAccountId, prefix: key.prefix },
        ...auditContext(request),
      },
    });
    return revoked;
  });
  return { apiKey: presentKey(result) };
}

export async function revokeServiceAccount(app: FastifyInstance, request: FastifyRequest, serviceAccountId: string) {
  const { organizationId, userId } = await requireHumanContext(request);
  await assertEntitlement(app, organizationId, 'apiAccess');
  const account = await requireAccount(app, organizationId, serviceAccountId);
  if (account.status === 'REVOKED') return { serviceAccount: presentAccount(account) };
  const now = new Date();

  const revoked = await app.prisma.$transaction(async (tx) => {
    await tx.serviceAccountApiKey.updateMany({
      where: { serviceAccountId, organizationId, revokedAt: null },
      data: { revokedAt: now },
    });
    const updated = await tx.serviceAccount.update({
      where: { id: serviceAccountId },
      data: { status: 'REVOKED', revokedAt: now },
      include: { apiKeys: { orderBy: { createdAt: 'desc' } } },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: 'service_account.revoked',
        entityType: 'service_account',
        entityId: serviceAccountId,
        metadata: { keyCount: account.apiKeys.length },
        ...auditContext(request),
      },
    });
    return updated;
  });
  return { serviceAccount: presentAccount(revoked) };
}
