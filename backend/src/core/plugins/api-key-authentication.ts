import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { sanitizeApiKeyPermissions, type Permission } from '../rbac/permissions.js';
import { hashSessionToken, secureHashEquals } from '../../shared/security/tokens.js';
import { assertEntitlement } from '../../modules/billing/billing.service.js';

const TOKEN_PATTERN = /^bsk_live_([a-f0-9]{16})_([A-Za-z0-9_-]{40,})$/;

function bearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  if (!authorization) return '';
  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' ? token?.trim() ?? '' : '';
}

function invalidKey(): never {
  throw new AppError({
    code: 'API_KEY_INVALID',
    message: 'API key недействителен или истёк',
    statusCode: 401,
  });
}

export const apiKeyAuthenticationPlugin = fp(async (app) => {
  app.decorateRequest('apiPrincipal', null);

  app.decorate('authenticateApiKey', async (request: FastifyRequest, _reply: FastifyReply) => {
    const token = bearerToken(request);
    const match = TOKEN_PATTERN.exec(token);
    if (!match?.[1]) invalidKey();
    const prefix = match[1];
    const now = new Date();

    const key = await app.prisma.serviceAccountApiKey.findUnique({
      where: { prefix },
      include: { serviceAccount: true },
    });
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= now)) invalidKey();
    if (!secureHashEquals(key.tokenHash, hashSessionToken(token))) invalidKey();

    const account = key.serviceAccount;
    if (
      account.status !== 'ACTIVE'
      || account.revokedAt
      || (account.expiresAt && account.expiresAt <= now)
      || account.organizationId !== key.organizationId
    ) invalidKey();

    const organization = await app.prisma.organization.findFirst({
      where: { id: key.organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!organization) invalidKey();

    // A downgrade must immediately disable previously issued service-account
    // credentials. Key existence alone never grants an enterprise capability.
    await assertEntitlement(app, key.organizationId, 'apiAccess');

    const accountPermissions = new Set(sanitizeApiKeyPermissions(account.permissions));
    const permissions = sanitizeApiKeyPermissions(key.permissions).filter((permission) => accountPermissions.has(permission));
    if (!permissions.length) {
      throw new AppError({
        code: 'API_KEY_SCOPE_EMPTY',
        message: 'API key не имеет активных scope',
        statusCode: 403,
      });
    }

    request.apiPrincipal = {
      type: 'SERVICE_ACCOUNT',
      organizationId: key.organizationId,
      serviceAccountId: account.id,
      apiKeyId: key.id,
      apiKeyPrefix: key.prefix,
      name: account.name,
      permissions,
    };

    const staleBefore = new Date(now.getTime() - 5 * 60 * 1000);
    if (!key.lastUsedAt || key.lastUsedAt < staleBefore) {
      void app.prisma.serviceAccountApiKey
        .update({ where: { id: key.id }, data: { lastUsedAt: now } })
        .catch((error: unknown) => request.log.warn({ err: error, apiKeyPrefix: key.prefix }, 'Failed to update API key lastUsedAt'));
    }
  });

  app.decorate('authorizeApiScope', (permission: Permission) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!request.apiPrincipal) {
        throw new AppError({ code: 'API_KEY_REQUIRED', message: 'Требуется API key', statusCode: 401 });
      }
      if (!request.apiPrincipal.permissions.includes(permission)) {
        throw new AppError({
          code: 'API_KEY_SCOPE_REQUIRED',
          message: 'API key не имеет требуемого scope',
          statusCode: 403,
          details: { permission },
        });
      }
    };
  });
});
