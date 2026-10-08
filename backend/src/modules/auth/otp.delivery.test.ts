import { describe, expect, it } from 'vitest';
import { buildExolveOtpText, classifyOtpHttpStatus, normalizeExolvePhone } from './otp.delivery.js';

describe('Exolve voice OTP helpers', () => {
  it('normalizes Russian +7 phone to digits', () => {
    expect(normalizeExolvePhone('+7 (999) 123-45-67')).toBe('79991234567');
  });

  it('normalizes Russian domestic 8 prefix to country code 7', () => {
    expect(normalizeExolvePhone('8 999 123-45-67')).toBe('79991234567');
  });

  it('keeps other valid international numbers as digits', () => {
    expect(normalizeExolvePhone('+49 151 23456789')).toBe('4915123456789');
  });

  it('rejects malformed phone numbers', () => {
    expect(() => normalizeExolvePhone('123')).toThrow('Invalid phone number for Exolve');
  });

  it('separates digits so TTS reads the code clearly', () => {
    expect(buildExolveOtpText('4821', 300)).toBe(
      'Business Shield. Код подтверждения: 4. 8. 2. 1. Повторяю: 4. 8. 2. 1. Код действует 5 минут.',
    );
  });

  it('classifies provider HTTP outcomes conservatively', () => {
    expect(classifyOtpHttpStatus(202)).toBe('accepted');
    expect(classifyOtpHttpStatus(400)).toBe('rejected');
    expect(classifyOtpHttpStatus(429)).toBe('rejected');
    expect(classifyOtpHttpStatus(500)).toBe('unknown');
    expect(classifyOtpHttpStatus(503)).toBe('unknown');
  });

  it('rounds TTL up to a full minute', () => {
    expect(buildExolveOtpText('1234', 61)).toContain('2 минут.');
  });
});
