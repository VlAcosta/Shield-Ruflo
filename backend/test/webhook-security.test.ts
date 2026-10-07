import { describe, expect, it } from 'vitest';
import {
  isBlockedWebhookAddress,
  resolveSafeWebhookTarget,
  validateWebhookUrlShape,
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

  it('keeps HTTPS and credential restrictions intact', () => {
    expect(() => validateWebhookUrlShape('http://example.com/hook')).toThrow('WEBHOOK_HTTPS_REQUIRED');
    expect(() => validateWebhookUrlShape('https://user:pass@example.com/hook')).toThrow('WEBHOOK_URL_CREDENTIALS_FORBIDDEN');
  });
});
