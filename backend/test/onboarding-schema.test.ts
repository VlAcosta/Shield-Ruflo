import { describe, expect, it } from 'vitest';
import { onboardingDraftSchema, saveOnboardingStateSchema } from '../src/modules/onboarding/onboarding.schemas.js';

describe('B4 onboarding persistence schema', () => {
  it('accepts a bounded three-step draft', () => {
    const draft = onboardingDraftSchema.parse({
      version: 2,
      step: 1,
      organization: {
        type: 'ul', title: 'ООО Тест', inn: '7701234567', kpp: '770101001', ogrn: '1027700123456',
        address: 'Москва', status: 'Действующая организация', registrationDate: '17.08.2025',
        confirmed: true, source: 'registry-webhook', demo: false,
        lookupEvidence: 'signed.lookup.evidence',
      },
      integrations: { yandex: { enabled: true, link: '' } },
      security: { autoLock: true, sessionMinutes: 15 },
    });
    expect(draft.step).toBe(1);
    expect(draft.organization.inn).toBe('7701234567');
    expect(draft.organization.lookupEvidence).toBe('signed.lookup.evidence');
  });

  it('rejects progress outside the published onboarding steps', () => {
    expect(() => saveOnboardingStateSchema.parse({
      step: 7,
      draft: {
        version: 2,
        step: 2,
        organization: { type: 'ul' },
        integrations: {},
        security: { autoLock: true, sessionMinutes: 15 },
      },
    })).toThrow();
  });

  it('rejects a persisted step that disagrees with its draft', () => {
    expect(() => saveOnboardingStateSchema.parse({
      step: 2,
      draft: { version: 2, step: 1, organization: {}, integrations: {}, security: {} },
    })).toThrow();
  });
});
