import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PortalProfileMenu from './PortalProfileMenu';
import useOrganizationContext from '../../../features/access/hooks/useOrganizationContext';

const mockNavigate = vi.fn();
const mockSelect = vi.fn();
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
}));
vi.mock('../hooks/usePortalProfile', () => () => ({
  initials: 'AP', fullName: 'Anna Petrova', roleLabel: 'Владелец', capabilities: {},
}));
vi.mock('../../../features/access/hooks/useOrganizationContext');

function renderMenu(props) {
  return render(
    <MemoryRouter future={routerFuture}>
      <PortalProfileMenu {...props} />
    </MemoryRouter>,
  );
}

function context(overrides = {}) {
  return {
    items: [
      { organization: { id: 'org-a', name: 'Альфа' }, membership: { role: 'OWNER' } },
      { organization: { id: 'org-b', name: 'Бета' }, membership: { role: 'ANALYST' } },
    ],
    activeOrganizationId: 'org-a',
    state: 'ready',
    error: '',
    switchingId: '',
    announcement: '',
    load: vi.fn(),
    select: mockSelect,
    ...overrides,
  };
}

describe('PortalProfileMenu organization switcher', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSelect.mockReset();
    useOrganizationContext.mockReturnValue(context());
  });

  test('marks the current organization and switches only through the server hook', async () => {
    mockSelect.mockResolvedValue({
      membership: {
        organizationId: 'org-b', role: 'ANALYST', permissions: ['dashboard.view'],
        organization: { id: 'org-b', name: 'Бета', onboardingStatus: 'COMPLETED' },
      },
    });
    const onClose = vi.fn();
    renderMenu({ open: true, onClose });

    const activeOrganization = screen.getByRole('button', { name: /Альфа/ });
    expect(activeOrganization).not.toBeDisabled();
    expect(activeOrganization).toHaveAttribute('aria-disabled', 'true');
    activeOrganization.focus();
    expect(activeOrganization).toHaveFocus();
    fireEvent.click(activeOrganization);
    expect(mockSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Бета/ }));

    await waitFor(() => expect(mockSelect).toHaveBeenCalledWith('org-b'));
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  test('retains the menu and shows a retryable switch error', () => {
    useOrganizationContext.mockReturnValue(context({ error: 'Доступ отозван' }));
    renderMenu({ open: true, onClose: vi.fn() });
    expect(screen.getByRole('alert')).toHaveTextContent('Доступ отозван');
  });

  test('focuses the dialog, closes on Escape, and restores the trigger', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const triggerRef = { current: trigger };
    const { unmount } = renderMenu({ open: true, onClose, triggerRef });
    await waitFor(() => expect(screen.getByRole('button', { name: /Альфа/ })).toHaveFocus());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  test('shows recovery when the user has no active organization membership', () => {
    const load = vi.fn();
    useOrganizationContext.mockReturnValue(context({ items: [], activeOrganizationId: null, load }));
    renderMenu({ open: true, onClose: vi.fn() });
    expect(screen.getByText('Нет активных организаций')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
    expect(load).toHaveBeenCalled();
  });
});
