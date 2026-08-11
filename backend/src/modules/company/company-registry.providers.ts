import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import type { CompanyLookupResult } from './company.service.js';

export type CompanyLookupKind = 'auto' | 'ul' | 'ip' | 'smz';

const DADATA_FIND_PARTY_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party';
const FNS_NPD_STATUS_URL = 'https://statusnpd.nalog.ru/api/v1/tracker/taxpayer_status';
const NPD_CACHE_TTL_MS = 15 * 60 * 1000;

type CacheEntry = { expiresAt: number; result: CompanyLookupResult };
const npdCache = new Map<string, CacheEntry>();

function formatDate(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function stateLabel(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  if (!normalized) return undefined;
  const labels: Record<string, string> = {
    ACTIVE: 'Действующая организация',
    LIQUIDATING: 'В процессе ликвидации',
    LIQUIDATED: 'Ликвидирована',
    BANKRUPT: 'Банкротство',
    REORGANIZING: 'В процессе реорганизации',
  };
  return labels[normalized] ?? normalized;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export async function lookupDadataCompany(inn: string, kind: CompanyLookupKind): Promise<CompanyLookupResult | null> {
  if (!env.DADATA_API_KEY) {
    throw new AppError({ code: 'COMPANY_LOOKUP_NOT_CONFIGURED', message: 'Поиск организаций не настроен', statusCode: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.DADATA_TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = { query: inn, count: 1 };
    if (kind === 'ul') body.type = 'LEGAL';
    if (kind === 'ip') body.type = 'INDIVIDUAL';

    const response = await fetch(DADATA_FIND_PARTY_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Token ${env.DADATA_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new AppError({ code: 'COMPANY_LOOKUP_AUTH_FAILED', message: 'Сервис реестра не авторизован', statusCode: 502 });
      }
      if (response.status === 429) {
        throw new AppError({ code: 'COMPANY_LOOKUP_RATE_LIMIT', message: 'Слишком много запросов к реестру. Повторите позже.', statusCode: 429 });
      }
      throw new AppError({ code: 'COMPANY_LOOKUP_FAILED', message: 'Сервис ЕГРЮЛ/ЕГРИП временно недоступен', statusCode: 502 });
    }

    const payload = asRecord(await response.json());
    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
    if (!suggestions.length) return null;

    const suggestion = asRecord(suggestions[0]);
    const data = asRecord(suggestion.data);
    if (String(data.inn ?? '') !== inn) return null;

    const apiType = String(data.type ?? '').toUpperCase();
    const type: 'ul' | 'ip' = apiType === 'INDIVIDUAL' ? 'ip' : 'ul';
    if (kind === 'ul' && type !== 'ul') return null;
    if (kind === 'ip' && type !== 'ip') return null;

    const name = asRecord(data.name);
    const fio = asRecord(data.fio);
    const address = asRecord(data.address);
    const addressData = asRecord(address.data);
    const state = asRecord(data.state);

    const title = String(
      name.short_with_opf
      ?? name.full_with_opf
      ?? suggestion.value
      ?? (type === 'ip' ? [fio.surname, fio.name, fio.patronymic].filter(Boolean).join(' ') : '')
      ?? '',
    ).trim();

    if (!title) {
      throw new AppError({ code: 'COMPANY_LOOKUP_INVALID_RESPONSE', message: 'Сервис реестра вернул неполные данные', statusCode: 502 });
    }

    return {
      type,
      title,
      shortTitle: String(name.short_with_opf ?? suggestion.value ?? title).trim(),
      inn,
      ...(type === 'ul' && typeof data.kpp === 'string' && data.kpp ? { kpp: data.kpp } : {}),
      ...(typeof data.ogrn === 'string' && data.ogrn ? { ogrn: data.ogrn } : {}),
      ...(addressData.source || address.value ? { address: String(addressData.source ?? address.value) } : {}),
      ...(state.status ? { status: stateLabel(state.status) } : {}),
      ...(formatDate(state.registration_date) ? { registrationDate: formatDate(state.registration_date)! } : {}),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError({ code: 'COMPANY_LOOKUP_TIMEOUT', message: 'Сервис ЕГРЮЛ/ЕГРИП не ответил вовремя', statusCode: 504 });
    }
    throw new AppError({ code: 'COMPANY_LOOKUP_FAILED', message: 'Не удалось получить сведения ЕГРЮЛ/ЕГРИП', statusCode: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupFnsNpdStatus(inn: string): Promise<CompanyLookupResult> {
  if (!/^\d{12}$/.test(inn)) {
    throw new AppError({ code: 'INVALID_INN', message: 'Для самозанятого ИНН должен содержать 12 цифр', statusCode: 400 });
  }

  const requestDate = todayIso();
  const cacheKey = `${inn}:${requestDate}`;
  const cached = npdCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.FNS_NPD_TIMEOUT_MS);
  try {
    const response = await fetch(FNS_NPD_STATUS_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ inn, requestDate }),
      signal: controller.signal,
    });

    const payload = asRecord(await response.json().catch(() => ({})));
    if (response.status === 422) {
      throw new AppError({
        code: 'NPD_LOOKUP_REJECTED',
        message: typeof payload.message === 'string' ? payload.message : 'ФНС временно не может проверить статус НПД',
        statusCode: 422,
      });
    }
    if (!response.ok) {
      throw new AppError({ code: 'NPD_LOOKUP_FAILED', message: 'Сервис ФНС НПД временно недоступен', statusCode: 502 });
    }
    if (payload.status !== true) {
      throw new AppError({
        code: 'NPD_STATUS_NOT_CONFIRMED',
        message: typeof payload.message === 'string' && payload.message ? payload.message : 'Статус самозанятого на текущую дату не подтверждён',
        statusCode: 404,
      });
    }

    const result: CompanyLookupResult = {
      type: 'smz',
      title: 'Самозанятый',
      shortTitle: 'Самозанятый',
      inn,
      status: typeof payload.message === 'string' && payload.message ? payload.message : 'Статус плательщика НПД подтверждён',
    };
    npdCache.set(cacheKey, { result, expiresAt: Date.now() + NPD_CACHE_TTL_MS });
    return result;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError({ code: 'NPD_LOOKUP_TIMEOUT', message: 'ФНС не ответила на проверку НПД вовремя', statusCode: 504 });
    }
    throw new AppError({ code: 'NPD_LOOKUP_FAILED', message: 'Не удалось проверить статус самозанятого', statusCode: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
