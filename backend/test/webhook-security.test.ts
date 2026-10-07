import { describe, expect, it } from 'vitest';
import {
  isBlockedWebhookAddress,
  resolveSafeWebhookTarget,
  validateWebhookUrlShape,
  webhookDeliveryHeaders,
} from '../src/modules/webhooks/webhook-security.js';

describe('webhook SSRF target validation', () => {
  it('blocks private IPv4 and bracketed IPv6 literals before DNS resolution', async () => {
    expect(isBlockedWebhookAddress('127.0.0.1')).toBe(true);
    expect(isBlockedWebhookAddress('[::1]')).toBe(true);
    expect(isBlockedWebhookAddress('::ffff:7f00:1')).toBe(true);
    expect(isBlockedWebhookAddress('[::ffff:7f00:1]')).toBe(true);

    expect(() => validateWebhookUrlShape('https://127.0.0.1/hook')).toThrow('WEBHOOK_PRIVATE_TARGET_FORBIDDEN');
    expect(() => validateWebhookUrlShape('https://[::1]/hook')).toThrow('WEBHOOK_PRIVATE_TARGET_FORBIDDEN');
    expect(() => validateWebhookUrlShape('https://[::ffff:7f00:1]/hook')).toThrow('WEBHOOK_PRIVATE_TARGET_FORBIDDEN');
  });

  it('pins a public hostname only when every resolved address is public', async () => {
    const safe = await resolveSafeWebhookTarget('https://hooks.example.test/events', async (hostname) => {
      expect(hostname).toBe('hooks.example.test');
      return [{ address: '203.0.113.10', family: 4 }];
    });
    expect(safe.address).toBe('203.0.113.10');
    expect(safe.family).toBe(4);

    await expect(resolveSafeWebhookTarget('https://hooks.example.test/events', async () => [
      { address: '203.0.113.10', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ])).rejects.toThrow('WEBHOOK_PRIVATE_TARGET_FORBIDDEN');
  });

  it('uses the stable event id as the webhook retry idempotency key', () => {
    const headers = webhookDeliveryHeaders({
      body: '{"id":"event-1"}',
      eventId: '11111111-1111-4111-8111-111111111111',
      eventType: 'review.created',
      timestamp: 1_800_000_000,
      attempt: 3,
      signature: 'v1=abc123',
    });

    expect(headers['idempotency-key']).toBe('11111111-1111-4111-8111-111111111111');
    expect(headers['x-business-shield-event-id']).toBe('11111111-1111-4111-8111-111111111111');
    expect(headers['x-business-shield-attempt']).toBe('3');
    expect(headers['x-business-shield-timestamp']).toBe('1800000000');
    expect(headers['x-business-shield-signature']).toBe('v1=abc123');
  });

  it('keeps HTTPS and credential restrictions intact', () => {
    expect(() => validateWebhookUrlShape('http://example.com/hook')).toThrow('WEBHOOK_HTTPS_REQUIRED');
    expect(() => validateWebhookUrlShape('https://user:pass@example.com/hook')).toThrow('WEBHOOK_URL_CREDENTIALS_FORBIDDEN');
  });
});
