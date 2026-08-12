import { apiRequest } from '../core/apiClient';
import {
  forceLogoutMember,
  readTeamSecurityState,
  updateMemberSecurityPolicy,
} from './teamSecurityService';

const state = vi.hoisted(() => ({ value: null }));

vi.mock('../core/apiClient', () => ({
  apiRequest: vi.fn(),
  joinEndpoint: (base, path = '') => `${String(base).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`.replace(/\/$/, ''),
}));
vi.mock('../core/dataScope', () => ({
  getCompanyScope: () => 'team-security-test',
  readScopedJson: (_key, options) => state.value ?? options?.fallback ?? null,
  writeScopedJson: (_key, value) => { state.value = value; },
}));
vi.mock('../profile/companyInvitationService', () => ({
  COMPANY_MEMBERSHIP_CHANGED_EVENT: 'membership-changed',
  COMPANY_MEMBERSHIP_KEY: 'membership-key',
  readCurrentMembership: () => null,
}));
vi.mock('../activity/companyActivityService', () => ({ recordCompanyActivity: vi.fn() }));

const member = { id: 'member-1', email: 'member@example.test', name: 'Иван' };

describe('teamSecurityService server-backed controls', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    state.value = null;
  });

  test('freezes a member through the real team security endpoint', async () => {
    apiRequest.mockResolvedValue({
      security: {
        memberId: member.id,
        email: member.email,
        status: 'frozen',
        frozenReason: 'Проверка',
        sessions: [],
      },
    });

    const result = await updateMemberSecurityPolicy(member, { status: 'frozen', frozenReason: 'Проверка' });

    expect(apiRequest.mock.calls[0][0]).toBe('/api/v1/team/members/member-1/security');
    expect(apiRequest.mock.calls[0][1]).toMatchObject({ method: 'PATCH' });
    expect(result.status).toBe('frozen');
  });

  test('does not fake a local freeze when the backend request fails', async () => {
    apiRequest.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));

    await expect(updateMemberSecurityPolicy(member, { status: 'frozen' })).rejects.toThrow('Forbidden');

    expect(readTeamSecurityState().members).toEqual({});
  });

  test('revokes all member sessions through the backend before changing local state', async () => {
    apiRequest.mockResolvedValue({ forcedLogoutAt: '2026-08-12T00:00:00.000Z' });

    await forceLogoutMember(member);

    expect(apiRequest.mock.calls[0][0]).toBe('/api/v1/team/members/member-1/sessions');
    expect(apiRequest.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });
});
