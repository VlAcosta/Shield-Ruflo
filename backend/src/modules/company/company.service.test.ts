import { describe, expect, it } from 'vitest';
import {
  companyLookupResultSchema,
  companyLookupWebhookResponseSchema,
} from './company.schemas.js';
import {
  createCompanyLookupEvidence,
  verifyCompanyLookupEvidence,
  type CompanyLookupResult,
} from './company.service.js';

const company: CompanyLookupResult = {
  type: 'ul',
  title: 'ООО Тест',
  inn: '7701234567',
  kpp: '770101001',
  ogrn: '1027700123456',
  address: 'Москва',
};
const context = { organizationId: 'organization-a', userId: 'user-a' };

describe('company lookup provider boundary', () => {
  it('accepts only a strict, typed provider payload', () => {
    expect(companyLookupWebhookResponseSchema.parse({ company, source: 'registry' })).toEqual({ company, source: 'registry' });
    expect(companyLookupWebhookResponseSchema.safeParse({ company: { ...company, arbitrary: true } }).success).toBe(false);
    expect(companyLookupResultSchema.safeParse({ ...company, type: 'unknown' }).success).toBe(false);
  });

  it('binds signed lookup evidence to the exact returned company', () => {
    const evidence = createCompanyLookupEvidence(company, 'registry', 'webhook', context, 1_000);

    expect(verifyCompanyLookupEvidence(evidence, company, context, 1_001)).toEqual({ source: 'registry', provider: 'webhook' });
    expect(verifyCompanyLookupEvidence(evidence, { ...company, title: 'Подмена' }, context, 1_001)).toBeNull();
    expect(verifyCompanyLookupEvidence(evidence, company, context, 1_000 + 10 * 60 * 1_000 + 1)).toBeNull();
    expect(verifyCompanyLookupEvidence(evidence, company, { ...context, organizationId: 'organization-b' }, 1_001)).toBeNull();
    expect(verifyCompanyLookupEvidence(evidence, company, { ...context, userId: 'user-b' }, 1_001)).toBeNull();
  });

  it('preserves the server-owned mock provider claim without upgrading it to webhook trust', () => {
    const evidence = createCompanyLookupEvidence(company, 'dev registry', 'mock', context, 1_000);
    expect(verifyCompanyLookupEvidence(evidence, company, context, 1_001)).toEqual({ source: 'dev registry', provider: 'mock' });
  });

  it('rejects forged or malformed evidence', () => {
    const evidence = createCompanyLookupEvidence(company, 'registry', 'webhook', context, 1_000);
    const [payload, signature] = evidence.split('.');

    expect(verifyCompanyLookupEvidence(`${payload}x.${signature}`, company, context, 1_001)).toBeNull();
    expect(verifyCompanyLookupEvidence('not-an-evidence', company, context, 1_001)).toBeNull();
  });
});
