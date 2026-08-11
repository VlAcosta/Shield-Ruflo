import { describe, expect, it } from 'vitest';
import { buildSmscOtpText, normalizeSmscPhone } from './otp.delivery.js';

describe('SMSC OTP helpers', () => {
  it('normalizes a Russian +7 phone to digits', () => {
    expect(normalizeSmscPhone('+7 (999) 123-45-67')).toBe('79991234567');
  });

  it('normalizes a Russian domestic 8 prefix to country code 7', () => {
    expect(normalizeSmscPhone('8 999 123-45-67')).toBe('79991234567');
  });

  it('keeps other valid international numbers as digits', () => {
    expect(normalizeSmscPhone('+49 151 23456789')).toBe('4915123456789');
  });

  it('rejects malformed phone numbers', () => {
    expect(() => normalizeSmscPhone('123')).toThrow('Invalid phone number for SMSC');
  });

  it('builds a short OTP message without unrelated data', () => {
    expect(buildSmscOtpText('4821', 300)).toBe(
      'Business Shield: код 4821. Никому не сообщайте. Действует 5 мин.',
    );
  });

  it('rounds TTL up to full minutes', () => {
    expect(buildSmscOtpText('1234', 61)).toContain('2 мин.');
  });
});