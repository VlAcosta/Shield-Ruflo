import { apiRequest } from '../core/apiClient';
import {
  changeProfilePin,
  getProfileSnapshot,
  saveCompanyProfile,
  savePersonalProfile,
} from './profileService';

vi.mock('../core/apiClient', () => ({
  apiRequest: vi.fn(),
  joinEndpoint: (base, path = '') => `${String(base).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`.replace(/\/$/, ''),
}));
vi.mock('../core/dataScope', () => ({
  getAccountScope: () => 'profile-test',
  readScopedJson: () => null,
  writeScopedJson: vi.fn(),
}));
vi.mock('../core/runtimeConfig', () => ({ isDemoDataEnabled: () => false }));
vi.mock('./companyInvitationService', () => ({
  createCompanyInvitation: vi.fn(),
  readCurrentMembership: vi.fn(() => null),
  saveCurrentMembership: vi.fn(),
}));
vi.mock('../activity/companyActivityService', () => ({ recordCompanyActivity: vi.fn() }));
vi.mock('../access/rbacService', () => ({ getRoleLabel: () => 'Владелец' }));

const serverSnapshot = {
  version: 2,
  personal: {
    firstName: 'Иван',
    lastName: 'Петров',
    email: 'ivan@example.test',
    phone: '+79990000000',
    position: 'Директор',
    telegram: '@ivan',
    avatar: '',
    stats: { reports: 0, score: 0, days: 1 },
  },
  company: {
    title: 'ООО Тест',
    inn: '7700000000',
    kpp: '770001001',
    ogrn: '1027700000000',
    legalAddress: 'Москва',
    verified: true,
  },
  sessions: [{ id: 'session-1', current: true }],
  users: [{ id: 'member-1', name: 'Иван Петров' }],
};

describe('profileService canonical API contract', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    localStorage.clear();
  });

  test('loads the complete server snapshot from /api/v1/profile', async () => {
    apiRequest.mockResolvedValue({ snapshot: serverSnapshot });

    const result = await getProfileSnapshot();

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0][0]).toBe('/api/v1/profile');
    expect(result.personal.firstName).toBe('Иван');
    expect(result.sessions).toEqual(serverSnapshot.sessions);
    expect(result.users).toEqual(serverSnapshot.users);
  });

  test('saves personal data through /api/v1/profile/personal', async () => {
    apiRequest.mockResolvedValue({ snapshot: { ...serverSnapshot, personal: { ...serverSnapshot.personal, firstName: 'Пётр' } } });

    const result = await savePersonalProfile({ firstName: 'Пётр' }, serverSnapshot);

    expect(apiRequest.mock.calls[0][0]).toBe('/api/v1/profile/personal');
    expect(apiRequest.mock.calls[0][1]).toMatchObject({ method: 'PATCH' });
    expect(result.personal.firstName).toBe('Пётр');
  });

  test('keeps company writes on the dedicated /api/v1/company/profile route', async () => {
    apiRequest.mockResolvedValue({ company: { ...serverSnapshot.company, title: 'ООО Новое' } });

    const result = await saveCompanyProfile({ ...serverSnapshot.company, title: 'ООО Новое' }, serverSnapshot);

    expect(apiRequest.mock.calls[0][0]).toBe('/api/v1/company/profile');
    expect(apiRequest.mock.calls[0][1]).toMatchObject({ method: 'PATCH' });
    expect(result.company.title).toBe('ООО Новое');
  });

  test('changes the cabinet PIN locally without making an HTTP request', async () => {
    localStorage.setItem('portal_pin_code', '1234');

    await expect(changeProfilePin({ currentPin: '1234', newPin: '5678' }))
      .resolves.toEqual({ success: true, storage: 'local' });

    expect(localStorage.getItem('portal_pin_code')).toBe('5678');
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
