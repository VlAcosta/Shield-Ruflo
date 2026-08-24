import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerFetch } from '../src/modules/integrations/providers/provider-http.js';
import { ReviewBridgeProviderAdapter } from '../src/modules/integrations/providers/bridge/review-bridge.adapter.js';
import type { ProviderConnectionContext } from '../src/modules/integrations/providers/provider.types.js';

function bridgeContext(): ProviderConnectionContext {
  return {
    organizationId: '00000000-0000-0000-0000-000000000001',
    accountId: '00000000-0000-0000-0000-000000000002',
    provider: 'yandex',
    externalAccountId: 'company-1',
    configuration: {
      bridgeBaseUrl: 'https://reviews-bridge.example.test',
      externalId: 'company-1',
    },
    credentials: { bridgeToken: 'test-bridge-token' },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.REVIEW_BRIDGE_ALLOWED_HOSTS;
});

describe('P27 provider outbound security', () => {
  it.each([
    ['wildberries', 'https://attacker.example.test/api/v1/feedbacks'],
    ['ozon', 'https://attacker.example.test/v1/review/list'],
    ['2gis', 'https://attacker.example.test/3.0/items/byid'],
  ])('rejects non-official %s hosts before any network request', async (provider, url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(providerFetch(url, { method: 'GET' }, { provider })).rejects.toMatchObject({
      code: `${provider.toUpperCase()}_HOST_NOT_ALLOWED`,
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not enable review bridges without a server-side host allowlist', () => {
    const adapter = new ReviewBridgeProviderAdapter('yandex', 'Яндекс Бизнес');
    expect(adapter.availability()).toMatchObject({
      configured: false,
      connectable: false,
      reasonCode: 'REVIEW_BRIDGE_ALLOWLIST_NOT_CONFIGURED',
    });
  });

  it('rejects a bridge URL whose host is not explicitly allowlisted', async () => {
    process.env.REVIEW_BRIDGE_ALLOWED_HOSTS = 'approved-bridge.example.test';
    const adapter = new ReviewBridgeProviderAdapter('yandex', 'Яндекс Бизнес');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(bridgeContext())).rejects.toMatchObject({
      code: 'REVIEW_BRIDGE_HOST_NOT_ALLOWED',
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a SHA-256 answer hash for reconciliation instead of putting answer text in the URL', async () => {
    process.env.REVIEW_BRIDGE_ALLOWED_HOSTS = 'reviews-bridge.example.test';
    const adapter = new ReviewBridgeProviderAdapter('yandex', 'Яндекс Бизнес');
    const answer = 'Спасибо за ваш подробный отзыв';
    const expectedHash = crypto.createHash('sha256').update(answer, 'utf8').digest('hex');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'CONFIRMED', externalReplyId: 'reply-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.reconcileReply(bridgeContext(), { reviewReference: 'review-1', text: answer });
    expect(result.status).toBe('CONFIRMED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = String(fetchMock.mock.calls[0]?.[0] || '');
    expect(requestUrl).toContain(`textHash=${expectedHash}`);
    expect(requestUrl).not.toContain(encodeURIComponent(answer));
    expect(requestUrl).not.toContain(answer);
  });
});
