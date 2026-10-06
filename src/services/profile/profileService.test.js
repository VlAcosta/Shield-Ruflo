import {
  changeProfilePin,
  getProfileSnapshot,
  revokeOtherProfileSessions,
  revokeProfileSession,
  saveCompanyProfile,
  savePersonalProfile,
  updateProfileUser,
} from './profileService';
import { apiRequest } from '../core/apiClient';

vi.mock('../core/apiClient', () => ({
  apiRequest: vi.fn(),
  joinEndpoint: (base, path) => {
    const normalizedBase = String(base || '').replace(/\/$/, '');
    const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
    return `${normalizedBase}${normalizedPath}`;
  },
}));

vi.mock('../activity/companyActivityService', () => ({
  recordCompanyActivity: vi.fn(),
}));

vi.mock('./companyInvitationService', () => ({
  createCompanyInvitation: vi.fn(),
  readCurrentMembership: vi.fn(() => null),
  saveCurrentMembership: vi.fn(),
}));

describe('profileService server contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  test('loads the full profile snapshot from the profile endpoint', async () => {
    apiRequest.mockResolvedValue({
      snapshot: {
        version: 2,
        personal: {
          firstName: 'Анна',
          lastName: 'Петрова',
          email: 'anna@example.test',
          phone: '+79991234567',
          stats: { reports: 0, score: 0, days: 10 },
        },
        company: { title: 'ООО Тест' },
        sessions: [{ id: 'session-1', current: true }],
        users: [{ id: 'member-1', name: 'Мария' }],
      },
    });

    const snapshot = await getProfileSnapshot();

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/profile',
      expect.objectContaining({ timeout: 9000 }),
    );
    expect(snapshot.personal.firstName).toBe('Анна');
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.users).toHaveLength(1);
  });

  test('saves personal data through /profile/personal', async () => {
    apiRequest.mockResolvedValue({
      snapshot: {
        version: 2,
        personal: {
          firstName: 'Анна',
          lastName: 'Петрова',
          email: 'anna@example.test',
          phone: '+79991234567',
          stats: { reports: 0, score: 0, days: 10 },
        },
        company: {},
        sessions: [],
        users: [],
      },
    });

    await savePersonalProfile(
      { firstName: 'Анна', lastName: 'Петрова', email: 'anna@example.test' },
      { personal: {}, company: {}, sessions: [], users: [] },
    );

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/profile/personal',
      expect.objectContaining({ method: 'PATCH', timeout: 9000 }),
    );
  });

  test('uses profile session endpoints for device revocation', async () => {
    apiRequest.mockResolvedValue({
      snapshot: {
        version: 2,
        personal: {},
        company: {},
        sessions: [],
        users: [],
      },
    });

    const snapshot = { personal: {}, company: {}, sessions: [], users: [] };
    await revokeProfileSession('session-2', snapshot);
    await revokeOtherProfileSessions(snapshot);

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      '/api/v1/profile/sessions/session-2',
      expect.objectContaining({ method: 'DELETE', timeout: 9000 }),
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      '/api/v1/profile/sessions',
      expect.objectContaining({ method: 'DELETE', timeout: 9000 }),
    );
  });

  test('updates team members through the profile users endpoint', async () => {
    apiRequest.mockResolvedValue({
      snapshot: {
        version: 2,
        personal: {},
        company: {},
        sessions: [],
        users: [{ id: 'member-1', role: 'MANAGER' }],
      },
    });

    await updateProfileUser(
      'member-1',
      { role: 'MANAGER' },
      { personal: {}, company: {}, sessions: [], users: [{ id: 'member-1', role: 'ANALYST' }] },
    );

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/profile/users/member-1',
      expect.objectContaining({ method: 'PATCH', timeout: 9000 }),
    );
  });

  test('keeps company editing on the dedicated company endpoint', async () => {
    apiRequest.mockResolvedValue({ company: { title: 'ООО Новое' } });

    await saveCompanyProfile(
      { title: 'ООО Новое' },
      { personal: {}, company: { title: 'ООО Старое' }, sessions: [], users: [] },
    );

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/company/profile',
      expect.objectContaining({ method: 'PATCH', timeout: 9000 }),
    );
  });

  test('changes the local PIN without calling a nonexistent server PIN endpoint', async () => {
    localStorage.setItem('portal_pin_code', '1234');

    await expect(changeProfilePin({ currentPin: '1234', newPin: '5678' }))
      .resolves.toEqual({ success: true });

    expect(localStorage.getItem('portal_pin_code')).toBe('5678');
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
