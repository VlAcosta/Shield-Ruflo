import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupFnsNpdStatus, mapDadataCompanyPayload } from '../src/modules/company/company-registry.providers.js';

const nativeFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = nativeFetch;
});

describe('production company registry providers', () => {
  it('maps an exact legal-party result from the ЕГРЮЛ/ЕГРИП provider', () => {
    const payload = {
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
    };

    expect(mapDadataCompanyPayload(payload, '7707083893', 'ul')).toMatchObject({
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

  it('does not accept a registry suggestion with another INN', () => {
    expect(mapDadataCompanyPayload({
      suggestions: [{ value: 'Чужая компания', data: { type: 'LEGAL', inn: '7700000000' } }],
    }, '7707083893', 'ul')).toBeNull();
  });

  it('does not mix legal and individual registry records', () => {
    expect(mapDadataCompanyPayload({
      suggestions: [{
        value: 'ИП Иванов',
        data: { type: 'INDIVIDUAL', inn: '500100732259', ogrn: '325500100000001' },
      }],
    }, '500100732259', 'ul')).toBeNull();
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
