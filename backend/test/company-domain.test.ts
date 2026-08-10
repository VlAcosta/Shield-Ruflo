import { describe, expect, it } from 'vitest';
import {
  formatRegistrationDate,
  inferLegalType,
  parseRegistrationDate,
  validateCompanyIdentifiers,
} from '../src/shared/domain/company.js';

describe('company domain helpers', () => {
  it('infers legal type from Russian INN length', () => {
    expect(inferLegalType('7701234567')).toBe('ul');
    expect(inferLegalType('772345678012')).toBe('ip');
    expect(inferLegalType('123')).toBeNull();
  });

  it('round-trips supported registration date formats', () => {
    expect(formatRegistrationDate(parseRegistrationDate('17.08.2025'))).toBe('17.08.2025');
    expect(formatRegistrationDate(parseRegistrationDate('2025-08-17'))).toBe('17.08.2025');
  });

  it('accepts leap day and rejects impossible calendar dates', () => {
    expect(formatRegistrationDate(parseRegistrationDate('29.02.2024'))).toBe('29.02.2024');
    expect(() => parseRegistrationDate('29.02.2023')).toThrow();
    expect(() => parseRegistrationDate('2025-02-30')).toThrow();
    expect(() => parseRegistrationDate('31.04.2025')).toThrow();
  });

  it('rejects mismatched IP identifiers', () => {
    expect(() => validateCompanyIdentifiers({
      legalType: 'ip',
      inn: '772345678012',
      kpp: '770101001',
      ogrn: '325770000123456',
    })).toThrow(/КПП/);
  });
});
