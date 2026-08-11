import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/env.js', () => ({
  env: {
    DADATA_API_KEY: 'test-dadata-key',
    DADATA_TIMEOUT_MS: 6_500,
    FNS_NPD_TIMEOUT_MS: 65_000,
  },
}));

import { lookupDadataCompany, lookupFnsNpdStatus } from '../src/modules/company/company-registry.providers.js';

const nativeFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = nativeFetch;
});

describe('production company registry providers', () => {
  it('maps an exact legal-party result from the ЕГРЮЛ/ЕГРИП provider', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      expect(headers.get('authorization')).toBe('Token test-dadata-key');
      expect(body).toMatchObject({ query: '7707083893', count: 1, type: 'LEGAL' });
      return new Response(JSON.stringify({
        suggestions: [{
          value: 'ПАО СБЕРБАНК',
          data: {
            type: 'LEGAL',
            inn: '7707083893',
            kpp: '773601001',
            ogrn: '1027700132195',
            name: {
              short_with_opf: 'ПАО СБЕРБАНК',
              full_with_opf: 'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО СБЕРБАНК РОССИИ',
            },
            address: { value: 'г Москва', data: { source: 'г Москва' } },
            state: { status: 'ACTIVE', registration_date: 677376000000 },
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupDadataCompany('7707083893', 'ul')).resolves.toMatchObject({
      type: 'ul',
      title: 'ПАО СБЕРБАНК',
      shortTitle: 'ПАО СБЕРБАНК',
      inn: '7707083893',
      kpp: '773601001',
      ogrn: '1027700132195',
      address: 'г Москва',
      status: 'Действующая организация',
    });
  });

  it('does not accept a registry suggestion with another INN', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      suggestions: [{ value: 'Чужая компания', data: { type: 'LEGAL', inn: '7700000000' } }],
    }), { status: 200 })));

    await expect(lookupDadataCompany('7707083893', 'ul')).resolves.toBeNull();
  });

  it('verifies НПД through FNS without inventing a person name or legal identifiers', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { inn?: string; requestDate?: string };
      expect(body.inn).toBe('500100732259');
      expect(body.requestDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      return new Response(JSON.stringify({
        status: true,
        message: 'является плательщиком налога на профессиональный доход',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupFnsNpdStatus('500100732259');
    expect(result).toEqual({
      type: 'smz',
      title: 'Самозанятый',
      shortTitle: 'Самозанятый',
      inn: '500100732259',
      status: 'является плательщиком налога на профессиональный доход',
    });
    expect(result).not.toHaveProperty('ogrn');
    expect(result).not.toHaveProperty('kpp');
    expect(result).not.toHaveProperty('address');
  });

  it('rejects an unconfirmed НПД status instead of falling back to a fake success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: false,
      message: 'не является плательщиком налога на профессиональный доход',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(lookupFnsNpdStatus('500100732258')).rejects.toMatchObject({ code: 'NPD_STATUS_NOT_CONFIRMED' });
  });
});
