import { describe, expect, it } from 'vitest';
import {
  createOpaqueToken,
  hashOtpCode,
  hashSessionToken,
  secureHashEquals,
} from '../src/shared/security/tokens.js';

describe('auth security primitives', () => {
  it('creates high-entropy opaque session tokens and stores only hashes', () => {
    const tokenA = createOpaqueToken();
    const tokenB = createOpaqueToken();

    expect(tokenA).not.toBe(tokenB);
    expect(tokenA.length).toBeGreaterThanOrEqual(40);
    expect(hashSessionToken(tokenA)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(tokenA)).not.toBe(tokenA);
  });

  it('binds an OTP hash to challenge, phone, purpose and code', () => {
    const base = {
      secret: '12345678901234567890123456789012',
      challengeId: 'challenge-1',
      phone: '+79991234567',
      purpose: 'SIGN_IN',
      code: '1234',
    };
    const expected = hashOtpCode(base);

    expect(secureHashEquals(expected, hashOtpCode(base))).toBe(true);
    expect(secureHashEquals(expected, hashOtpCode({ ...base, code: '9999' }))).toBe(false);
    expect(secureHashEquals(expected, hashOtpCode({ ...base, challengeId: 'challenge-2' }))).toBe(false);
  });
});
