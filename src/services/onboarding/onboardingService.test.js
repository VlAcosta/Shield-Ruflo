import { applyOnboardingConfiguration, loadOnboardingState, saveOnboardingState } from './onboardingService';
import { authService } from '../auth/authService';
import { createDefaultOnboardingDraft } from '../../features/onboarding/model/onboardingData';

jest.mock('../auth/authService', () => ({ authService: { persistSession: jest.fn() } }));

const response = (body, status = 200) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  url: '/api/v1/test',
  headers: { get: () => 'application/json' },
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

describe('onboardingService server authority', () => {
  beforeEach(() => { localStorage.clear(); authService.persistSession.mockClear(); global.fetch = jest.fn(); });

  test('hydrates the draft returned by the backend', async () => {
    const draft = { ...createDefaultOnboardingDraft(), step: 1, organization: { ...createDefaultOnboardingDraft().organization, title: 'ООО Сервер' } };
    fetch.mockImplementation(() => response({ onboarding: { onboardingStatus: 'IN_PROGRESS', onboardingStep: 1, onboardingDraft: draft } }));
    await expect(loadOnboardingState()).resolves.toMatchObject({ draft: { step: 1, organization: { title: 'ООО Сервер' } } });
    expect(fetch).toHaveBeenCalledWith('/api/v1/onboarding/state', expect.objectContaining({ credentials: 'include' }));
  });

  test('saves progress through the backend', async () => {
    fetch.mockImplementation(() => response({ onboarding: { onboardingStatus: 'IN_PROGRESS' } }));
    const draft = { ...createDefaultOnboardingDraft(), step: 2 };
    await saveOnboardingState(draft);
    expect(fetch).toHaveBeenCalledWith('/api/v1/onboarding/state', expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"step":2') }));
  });

  test('does not persist completion when the backend rejects it', async () => {
    fetch.mockImplementation(() => response({ error: { code: 'FAILED', message: 'Не завершено' } }, 422));
    await expect(applyOnboardingConfiguration({ draft: createDefaultOnboardingDraft(), pin: '1234' })).rejects.toThrow('Не завершено');
    expect(authService.persistSession).not.toHaveBeenCalled();
    expect(localStorage.getItem('onboarding_completed')).toBeNull();
    expect(localStorage.getItem('portal_pin_code')).toBeNull();
  });

  test('persists the returned session only after successful completion', async () => {
    fetch.mockImplementation(() => response({ ok: true, user: { id: 'user-1', membership: { organizationId: 'org-1' } } }));
    const base = createDefaultOnboardingDraft();
    const draft = { ...base, organization: { ...base.organization, title: 'ООО Сервер', inn: '7701234567', kpp: '770101001', ogrn: '1027700123456', confirmed: true, source: 'registry-webhook', lookupEvidence: 'signed-evidence' } };
    await applyOnboardingConfiguration({ draft, pin: '2468' });
    expect(fetch).toHaveBeenCalledWith('/api/v1/onboarding/complete', expect.objectContaining({ body: expect.stringContaining('signed-evidence') }));
    expect(authService.persistSession).toHaveBeenCalledWith({ user: expect.objectContaining({ id: 'user-1' }) });
    expect(localStorage.getItem('onboarding_completed')).toBe('1');
  });
});
