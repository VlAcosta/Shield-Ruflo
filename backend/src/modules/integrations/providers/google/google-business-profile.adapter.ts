import { env } from '../../../../config/env.js';
import { ProviderAdapterError } from '../provider.errors.js';
import type { ProviderAdapter, ProviderConnectionContext } from '../provider.types.js';
import {
  GoogleBusinessProfileClient,
  type GoogleBusinessAccount,
  type GoogleBusinessLocation,
} from './google-business-profile.client.js';

export const GOOGLE_BUSINESS_PROVIDER_ID = 'google-business-profile';

function configured(): boolean {
  return env.GOOGLE_BUSINESS_ENABLED
    && Boolean(env.GOOGLE_BUSINESS_CLIENT_ID)
    && Boolean(env.GOOGLE_BUSINESS_CLIENT_SECRET)
    && Boolean(env.GOOGLE_BUSINESS_REDIRECT_URI);
}

export function googleBusinessProfileClient(): GoogleBusinessProfileClient {
  return new GoogleBusinessProfileClient({
    clientId: env.GOOGLE_BUSINESS_CLIENT_ID,
    clientSecret: env.GOOGLE_BUSINESS_CLIENT_SECRET,
    redirectUri: env.GOOGLE_BUSINESS_REDIRECT_URI,
    timeoutMs: env.GOOGLE_BUSINESS_TIMEOUT_MS,
  });
}

function selectedAccountName(context: ProviderConnectionContext): string | null {
  const value = context.configuration.googleAccountName;
  return typeof value === 'string' && /^accounts\/[^/]+$/.test(value) ? value : null;
}

function publicAccount(account: GoogleBusinessAccount) {
  return {
    name: account.name,
    accountName: account.accountName ?? null,
    type: account.type ?? null,
    role: account.role ?? null,
    verificationState: account.verificationState ?? null,
    vettedState: account.vettedState ?? null,
  };
}

export class GoogleBusinessProfileAdapter implements ProviderAdapter {
  readonly id = GOOGLE_BUSINESS_PROVIDER_ID;
  readonly displayName = 'Google Business Profile';
  readonly capabilities = ['oauth', 'accounts.read', 'locations.read', 'profile.read'] as const;

  availability() {
    if (!env.GOOGLE_BUSINESS_ENABLED) {
      return {
        configured: false,
        connectable: false,
        reasonCode: 'GOOGLE_BUSINESS_DISABLED',
        reasonMessage: 'Google Business Profile отключён в конфигурации сервера.',
      };
    }
    if (!configured()) {
      return {
        configured: false,
        connectable: false,
        reasonCode: 'GOOGLE_BUSINESS_NOT_CONFIGURED',
        reasonMessage: 'OAuth credentials Google Business Profile не настроены.',
      };
    }
    return { configured: true, connectable: true };
  }

  async connect(context: ProviderConnectionContext) {
    const refreshToken = context.credentials.refreshToken;
    if (!refreshToken) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_REFRESH_TOKEN_MISSING',
        message: 'Google OAuth ещё не завершён или refresh token отсутствует.',
        statusCode: 409,
        retryable: false,
      });
    }

    const client = googleBusinessProfileClient();
    const token = await client.refreshAccessToken(refreshToken);
    const accounts = await client.listAccounts(token.accessToken);
    if (!accounts.length) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_BUSINESS_NO_ACCOUNTS',
        message: 'В Google аккаунте нет доступных Business Profile accounts.',
        statusCode: 422,
        retryable: false,
      });
    }

    const selected = selectedAccountName(context);
    if (!selected) {
      return {
        verified: true as const,
        health: 'DEGRADED' as const,
        configuration: {
          googleSetupState: 'ACCOUNT_SELECTION_REQUIRED',
          googleAccounts: accounts.map(publicAccount),
        },
      };
    }

    const account = accounts.find((item) => item.name === selected);
    if (!account) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_BUSINESS_ACCOUNT_NOT_ACCESSIBLE',
        message: 'Выбранный Google Business Profile account больше недоступен текущей авторизации.',
        statusCode: 403,
        retryable: false,
      });
    }

    const locations = await client.listLocations(token.accessToken, selected);
    return {
      verified: true as const,
      health: 'CONNECTED' as const,
      externalAccountId: selected,
      configuration: {
        googleSetupState: 'READY',
        googleAccountName: selected,
        googleAccount: publicAccount(account),
        googleLocations: locations.map((location) => ({
          name: location.name,
          title: location.title ?? null,
          storeCode: location.storeCode ?? null,
        })),
        googleLocationCount: locations.length,
      },
    };
  }

  async disconnect(context: ProviderConnectionContext) {
    const refreshToken = context.credentials.refreshToken;
    if (!refreshToken) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_REFRESH_TOKEN_MISSING',
        message: 'Нельзя подтвердить отзыв доступа Google: refresh token отсутствует.',
        statusCode: 409,
        retryable: false,
      });
    }
    await googleBusinessProfileClient().revokeToken(refreshToken);
    return { confirmed: true };
  }
}

export async function listGoogleBusinessAccounts(refreshToken: string): Promise<GoogleBusinessAccount[]> {
  const client = googleBusinessProfileClient();
  const token = await client.refreshAccessToken(refreshToken);
  return client.listAccounts(token.accessToken);
}

export async function listGoogleBusinessLocations(
  refreshToken: string,
  accountName: string,
): Promise<GoogleBusinessLocation[]> {
  const client = googleBusinessProfileClient();
  const token = await client.refreshAccessToken(refreshToken);
  return client.listLocations(token.accessToken, accountName);
}
