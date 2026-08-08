import { INTEGRATION_ITEMS, createDefaultIntegrations } from '../../integrations/model/integrationCatalog';

export const ONBOARDING_DRAFT_KEY = 'business-shield:onboarding:draft:v2';
export const ONBOARDING_COMPLETED_KEY = 'onboarding_completed';
export const PIN_CODE_KEY = 'portal_pin_code';
export const PIN_UNLOCK_KEY = 'portal_pin_unlocked';
export const ONBOARDING_STEPS = [
  {
    id: 'organization',
    number: '01',
    title: 'Организация',
    description: 'Подтвердим реквизиты',
  },
  {
    id: 'integrations',
    number: '02',
    title: 'Интеграции',
    description: 'Подключим площадки',
  },
  {
    id: 'security',
    number: '03',
    title: 'Безопасность',
    description: 'Защитим кабинет',
  },
];

export { INTEGRATION_ITEMS, createDefaultIntegrations };

export function createDefaultOnboardingDraft() {
  return {
    version: 2,
    step: 0,
    organization: {
      type: 'ul',
      title: '',
      inn: '',
      kpp: '',
      ogrn: '',
      address: '',
      status: '',
      registrationDate: '',
      confirmed: false,
      source: '',
      demo: false,
    },
    integrations: createDefaultIntegrations(),
    security: {
      autoLock: true,
      sessionMinutes: 15,
    },
  };
}
