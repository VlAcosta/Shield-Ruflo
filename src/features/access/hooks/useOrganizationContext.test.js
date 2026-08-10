import { act, renderHook, waitFor } from '@testing-library/react';
import { authService } from '../../../services/auth/authService';
import { organizationContextService } from '../../../services/organizations/organizationContextService';
import useOrganizationContext, { ORGANIZATION_CONTEXT_CHANGED_EVENT } from './useOrganizationContext';

jest.mock('../../../services/auth/authService', () => ({
  SESSION_CHANGED_EVENT: 'business-shield:auth-session-changed',
  authService: { persistSession: jest.fn() },
}));

jest.mock('../../../services/organizations/organizationContextService', () => ({
  organizationContextService: { list: jest.fn(), select: jest.fn() },
}));

describe('useOrganizationContext', () => {
  beforeEach(() => {
    localStorage.clear();
    authService.persistSession.mockReset();
    organizationContextService.list.mockReset();
    organizationContextService.select.mockReset();
  });

  test('loads the server-selected organization context', async () => {
    organizationContextService.list.mockResolvedValue({
      organizations: [{ organization: { id: 'org-a', name: 'Альфа' }, membership: { role: 'OWNER' } }],
      activeOrganizationId: 'org-a',
    });

    const { result } = renderHook(() => useOrganizationContext());

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.activeOrganizationId).toBe('org-a');
    expect(result.current.items).toHaveLength(1);
  });

  test('persists only the server-returned membership and announces a tenant switch', async () => {
    organizationContextService.list.mockResolvedValue({ organizations: [], activeOrganizationId: 'org-a' });
    const user = {
      id: 'user-1',
      membership: {
        organizationId: 'org-b',
        role: 'ANALYST',
        permissions: ['dashboard.view'],
        organization: { id: 'org-b', name: 'Бета' },
      },
    };
    organizationContextService.select.mockResolvedValue(user);
    const onChanged = jest.fn();
    window.addEventListener(ORGANIZATION_CONTEXT_CHANGED_EVENT, onChanged);
    const { result } = renderHook(() => useOrganizationContext());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    await act(async () => result.current.select('org-b'));

    expect(authService.persistSession).toHaveBeenCalledWith({ user });
    expect(result.current.activeOrganizationId).toBe('org-b');
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({
      detail: { organizationId: 'org-b' },
    }));
    window.removeEventListener(ORGANIZATION_CONTEXT_CHANGED_EVENT, onChanged);
  });

  test('keeps the previous tenant active and exposes a retryable switch error', async () => {
    organizationContextService.list.mockResolvedValue({ organizations: [], activeOrganizationId: 'org-a' });
    organizationContextService.select.mockRejectedValue(new Error('Доступ отозван'));
    const { result } = renderHook(() => useOrganizationContext());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    let switchError;
    await act(async () => {
      try {
        await result.current.select('org-b');
      } catch (error) {
        switchError = error;
      }
    });

    expect(switchError).toMatchObject({ message: 'Доступ отозван' });
    expect(result.current.activeOrganizationId).toBe('org-a');
    expect(result.current.error).toBe('Доступ отозван');
    expect(result.current.switchingId).toBe('');
    expect(authService.persistSession).not.toHaveBeenCalled();
  });
});
