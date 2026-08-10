import { describe, expect, it } from 'vitest';
import { isTrustedProxyConfig, parseTrustedProxyConfig } from './env.js';

describe('trusted proxy configuration', () => {
  it('disables forwarded-address trust by default', () => {
    expect(parseTrustedProxyConfig('')).toBe(false);
    expect(parseTrustedProxyConfig('   ')).toBe(false);
  });

  it('parses explicit proxy IP, CIDR and loopback boundaries', () => {
    expect(parseTrustedProxyConfig('127.0.0.1,10.20.0.0/16,loopback')).toEqual([
      '127.0.0.1',
      '10.20.0.0/16',
      'loopback',
    ]);
  });

  it('rejects broad booleans, hostnames, and invalid network prefixes', () => {
    expect(isTrustedProxyConfig('true')).toBe(false);
    expect(isTrustedProxyConfig('proxy.internal')).toBe(false);
    expect(isTrustedProxyConfig('10.0.0.0/33')).toBe(false);
    expect(isTrustedProxyConfig('2001:db8::/129')).toBe(false);
  });
});
