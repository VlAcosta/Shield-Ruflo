import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { z } from 'zod';
import { env } from '../../../../config/env.js';
import { AppError } from '../../../../core/errors/app-error.js';
import {
  createIntegrationAccount,
  requestIntegrationConnect,
  saveIntegrationCredentials,
} from '../../integrations.service.js';
import { loadIntegrationCredentials } from '../credential-vault.js';
import { ProviderAdapterError } from '../provider.errors.js';
import { providerRegistry } from '../provider.registry.js';
import {
  GOOGLE_BUSINESS_PROVIDER_ID,
  googleBusinessProfileClient,
  listGoogleBusinessAccounts,
  listGoogleBusinessLocations,
} from './google-business-profile.adapter.js';
import {
  createGoogleOAuthState,
  googleOAuthNonceHash,
  verifyGoogleOAuthState,
} from './google-oauth-state.js';

const callbackQuerySchema = z.object({
  state: z.string().min(20),
  code: z.string().min(1).max(2048).optional(),
  error: z.string().max(200).optional(),
});
const accountParamsSchema = z.object({ accountId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(240) });
const selectionSchema = z.object({
  googleAccountName: z.string().regex(/^accounts\/[A-Za-z0-9_-]+$/).max(260),
  locationNames: z.array(z.string().regex(/^locations\/[A-Za-z0-9_-]+$/).max(260)).min(1).max(500),
});

function orgId(request: FastifyRequest): string {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return request.auth.organizationId;
}

function userId(request: FastifyRequest): string {
  if (!request.auth?.userId) {
    throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
  }
  return request.auth.userId;
}

function configurationObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function returnUrl(params: Record<string, string>): string {
  if (!env.GOOGLE_BUSINESS_RETURN_URL) {
    throw new AppError({ code: 'GOOGLE_BUSINESS_NOT_CONFIGURED', message: 'Google Business Profile return URL не настроен', statusCode: 503 });
  }
  const url = new URL(env.GOOGLE_BUSINESS_RETURN_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function safeProviderCode(error: unknown): string {
  if (error instanceof AppError || error instanceof ProviderAdapterError) return error.code;
  return 'GOOGLE_BUSINESS_CONNECTION_FAILED';
}

async function googleAccountForOrganization(app: Parameters<FastifyPluginAsync>[0], organizationId: string) {
  return app.prisma.integrationAccount.findFirst({
    where: { organizationId, provider: GOOGLE_BUSINESS_PROVIDER_ID },
    orderBy: { createdAt: 'desc' },
  });
}

async function refreshTokenForAccount(
  app: Parameters<FastifyPluginAsync>[0],
  organizationId: string,
  accountId: string,
): Promise<string> {
  const credentials = await loadIntegrationCredentials(app, organizationId, accountId);
  const refreshToken = credentials.refreshToken;
  if (!refreshToken) {
    throw new AppError({
      code: 'GOOGLE_REFRESH_TOKEN_MISSING',
      message: 'Google OAuth ещё не завершён. Подключите Google Business Profile заново.',
      statusCode: 409,
    });
  }
  return refreshToken;
}

export const googleBusinessProfileRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/integrations/providers/google-business-profile/oauth/start',
    { preHandler: [app.authenticate, app.authorize('integrations.manage')] },
    async (request) => {
      const organizationId = orgId(request);
      const currentUserId = userId(request);
      const adapter = providerRegistry.get(GOOGLE_BUSINESS_PROVIDER_ID);
      const availability = adapter?.availability();
      if (!adapter || !availability?.configured || !availability.connectable) {
        throw new AppError({
          code: availability?.reasonCode || 'GOOGLE_BUSINESS_NOT_CONFIGURED',
          message: availability?.reasonMessage || 'Google Business Profile не настроен на сервере.',
          statusCode: 422,
        });
      }

      let account = await googleAccountForOrganization(app, organizationId);
      if (!account) {
        const created = await createIntegrationAccount(app, organizationId, {
          provider: GOOGLE_BUSINESS_PROVIDER_ID,
          name: 'Google Business Profile',
        });
        account = await app.prisma.integrationAccount.findFirst({ where: { id: created.id, organizationId } });
      }
      if (!account) {
        throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Не удалось подготовить Google integration', statusCode: 500 });
      }

      const oauthState = createGoogleOAuthState({ organizationId, userId: currentUserId, accountId: account.id });
      const configuration = {
        ...configurationObject(account.configuration),
        googleSetupState: 'OAUTH_PENDING',
        googleOauthNonceHash: oauthState.nonceHash,
        googleOauthStateExpiresAt: oauthState.expiresAt.toISOString(),
      };
      await app.prisma.$transaction([
        app.prisma.integrationAccount.update({
          where: { id: account.id },
          data: {
            status: 'CONNECTING',
            lastErrorCode: null,
            lastErrorMessage: null,
            configuration: asJson(configuration),
          },
        }),
        app.prisma.integrationEvent.create({
          data: {
            organizationId,
            accountId: account.id,
            type: 'oauth.started',
            payload: { provider: GOOGLE_BUSINESS_PROVIDER_ID, expiresAt: oauthState.expiresAt.toISOString() },
          },
        }),
      ]);

      return {
        providerId: GOOGLE_BUSINESS_PROVIDER_ID,
        accountId: account.id,
        authorizationUrl: googleBusinessProfileClient().authorizationUrl(oauthState.state),
        expiresAt: oauthState.expiresAt,
      };
    },
  );

  app.get(
    '/integrations/providers/google-business-profile/oauth/callback',
    { preHandler: [app.authenticate, app.authorize('integrations.manage')] },
    async (request, reply) => {
      const query = callbackQuerySchema.parse(request.query);
      const state = verifyGoogleOAuthState(query.state);
      const organizationId = orgId(request);
      const currentUserId = userId(request);
      if (state.organizationId !== organizationId || state.userId !== currentUserId) {
        throw new AppError({ code: 'GOOGLE_OAUTH_STATE_CONTEXT_MISMATCH', message: 'Google OAuth state не соответствует текущей сессии.', statusCode: 403 });
      }

      const account = await app.prisma.integrationAccount.findFirst({
        where: { id: state.accountId, organizationId, provider: GOOGLE_BUSINESS_PROVIDER_ID },
      });
      if (!account) {
        throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Google integration не найдена', statusCode: 404 });
      }

      const configuration = configurationObject(account.configuration);
      if (configuration.googleOauthNonceHash !== googleOAuthNonceHash(state.nonce)) {
        throw new AppError({ code: 'GOOGLE_OAUTH_STATE_REPLAYED', message: 'Google OAuth state уже использован или не совпадает.', statusCode: 400 });
      }

      await app.prisma.integrationAccount.update({
        where: { id: account.id },
        data: {
          configuration: asJson({
            ...configuration,
            googleOauthNonceHash: null,
            googleOauthStateExpiresAt: null,
            googleSetupState: 'OAUTH_CALLBACK_RECEIVED',
          }),
        },
      });

      if (query.error) {
        await app.prisma.$transaction([
          app.prisma.integrationAccount.update({
            where: { id: account.id },
            data: {
              status: 'ERROR',
              lastErrorCode: 'GOOGLE_OAUTH_DENIED',
              lastErrorMessage: 'Пользователь не предоставил доступ Google Business Profile.',
            },
          }),
          app.prisma.integrationEvent.create({
            data: { organizationId, accountId: account.id, type: 'oauth.denied', payload: { provider: GOOGLE_BUSINESS_PROVIDER_ID } },
          }),
        ]);
        return reply.redirect(returnUrl({ google: 'cancelled' }));
      }
      if (!query.code) {
        throw new AppError({ code: 'GOOGLE_OAUTH_CODE_MISSING', message: 'Google OAuth code отсутствует.', statusCode: 400 });
      }

      try {
        const token = await googleBusinessProfileClient().exchangeAuthorizationCode(query.code);
        if (token.refreshToken) {
          await saveIntegrationCredentials(app, organizationId, account.id, { refreshToken: token.refreshToken });
        } else {
          await refreshTokenForAccount(app, organizationId, account.id);
        }

        await app.prisma.integrationAccount.update({
          where: { id: account.id },
          data: {
            configuration: asJson({
              ...configurationObject((await app.prisma.integrationAccount.findUniqueOrThrow({ where: { id: account.id } })).configuration),
              googleGrantedScope: token.scope ?? null,
            }),
          },
        });

        const connected = await requestIntegrationConnect(app, organizationId, account.id);
        const setupState = configurationObject(connected.integration.configuration).googleSetupState;
        return reply.redirect(returnUrl({
          google: 'authorized',
          setup: typeof setupState === 'string' ? setupState.toLowerCase() : 'unknown',
          status: connected.integration.status.toLowerCase(),
        }));
      } catch (error) {
        const code = safeProviderCode(error);
        await app.prisma.integrationAccount.update({
          where: { id: account.id },
          data: { status: 'ERROR', lastErrorCode: code, lastErrorMessage: 'Не удалось завершить подключение Google Business Profile.' },
        });
        await app.prisma.integrationEvent.create({
          data: { organizationId, accountId: account.id, type: 'oauth.failed', payload: { provider: GOOGLE_BUSINESS_PROVIDER_ID, code } },
        });
        return reply.redirect(returnUrl({ google: 'error', code }));
      }
    },
  );

  app.get(
    '/integrations/providers/google-business-profile/accounts',
    { preHandler: [app.authenticate, app.authorize('integrations.view')] },
    async (request) => {
      const organizationId = orgId(request);
      const account = await googleAccountForOrganization(app, organizationId);
      if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Google integration не найдена', statusCode: 404 });
      const accounts = await listGoogleBusinessAccounts(await refreshTokenForAccount(app, organizationId, account.id));
      return { accounts };
    },
  );

  app.get(
    '/integrations/providers/google-business-profile/accounts/:accountId/locations',
    { preHandler: [app.authenticate, app.authorize('integrations.view')] },
    async (request) => {
      const organizationId = orgId(request);
      const { accountId } = accountParamsSchema.parse(request.params);
      const integration = await googleAccountForOrganization(app, organizationId);
      if (!integration) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Google integration не найдена', statusCode: 404 });
      const locations = await listGoogleBusinessLocations(
        await refreshTokenForAccount(app, organizationId, integration.id),
        `accounts/${accountId}`,
      );
      return { accountName: `accounts/${accountId}`, locations };
    },
  );

  app.put(
    '/integrations/providers/google-business-profile/selection',
    { preHandler: [app.authenticate, app.authorize('integrations.manage')] },
    async (request) => {
      const organizationId = orgId(request);
      const body = selectionSchema.parse(request.body);
      const integration = await googleAccountForOrganization(app, organizationId);
      if (!integration) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Google integration не найдена', statusCode: 404 });
      const refreshToken = await refreshTokenForAccount(app, organizationId, integration.id);
      const accounts = await listGoogleBusinessAccounts(refreshToken);
      const selectedAccount = accounts.find((account) => account.name === body.googleAccountName);
      if (!selectedAccount) {
        throw new AppError({
          code: 'GOOGLE_BUSINESS_ACCOUNT_NOT_ACCESSIBLE',
          message: 'Выбранный Google Business Profile account недоступен текущей авторизации.',
          statusCode: 403,
        });
      }
      const locations = await listGoogleBusinessLocations(refreshToken, body.googleAccountName);
      const accessibleLocations = new Set(locations.map((location) => location.name));
      const unavailable = body.locationNames.filter((name) => !accessibleLocations.has(name));
      if (unavailable.length) {
        throw new AppError({
          code: 'GOOGLE_BUSINESS_LOCATION_NOT_ACCESSIBLE',
          message: 'Одна или несколько выбранных Google locations недоступны текущей авторизации.',
          statusCode: 403,
        });
      }

      await app.prisma.integrationAccount.update({
        where: { id: integration.id },
        data: {
          configuration: asJson({
            ...configurationObject(integration.configuration),
            googleSetupState: 'READY',
            googleAccountName: body.googleAccountName,
            googleSelectedLocationNames: body.locationNames,
            googleSelectedLocations: locations
              .filter((location) => body.locationNames.includes(location.name))
              .map((location) => ({ name: location.name, title: location.title ?? null, storeCode: location.storeCode ?? null })),
          }),
        },
      });

      const connected = await requestIntegrationConnect(app, organizationId, integration.id);
      return {
        ...connected,
        selection: { googleAccountName: body.googleAccountName, locationNames: body.locationNames },
      };
    },
  );
};
