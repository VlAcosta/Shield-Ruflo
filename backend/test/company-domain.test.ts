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

  it('rejects mismatched IP identifiers', () => {
    expect(() => validateCompanyIdentifiers({
      legalType: 'ip',
      inn: '772345678012',
      kpp: '770101001',
      ogrn: '325770000123456',
    })).toThrow(/КПП/);
  });
});
