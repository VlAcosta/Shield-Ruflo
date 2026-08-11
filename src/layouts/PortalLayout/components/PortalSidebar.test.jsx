import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { authService } from '../../../services/auth/authService';
import PortalSidebar from './PortalSidebar';

const mockNavigate = vi.fn();
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
}));
vi.mock('../../../services/auth/authService', () => ({ authService: { logout: vi.fn() } }));
vi.mock('../../../features/access/hooks/useAccessControl', () => ({
  default: () => ({ can: () => false, role: { label: 'Аналитик' } }),
}));
vi.mock('../../../services/access/rbacService', () => ({ findFirstAllowedRoute: () => '/dashboard' }));
vi.mock('../../../features/appearance/hooks/useAppearance', () => ({
  default: () => ({
    isDark: false,
    mode: 'light',
    toggleResolvedTheme: vi.fn(),
  }),
}));
vi.mock('../navigation', () => ({
  navigationPrimary: [],
  navigationGroups: [{
    id: 'reputation',
    label: 'Репутация',
    Icon: () => null,
    items: [{
      to: '/reviews',
      label: 'Отзывы',
      permission: 'reviews.view',
      Icon: () => null,
    }],
  }],
  navigationHelp: { to: '/faq', label: 'Помощь', permission: 'support.view', Icon: () => null },
}));

function renderSidebar() {
  return render(
    <MemoryRouter future={routerFuture}>
      <PortalSidebar />
    </MemoryRouter>,
  );
}

describe('PortalSidebar logout and permission-aware navigation', () => {
  beforeEach(() => {
    authService.logout.mockReset();
    mockNavigate.mockReset();
  });

  test('redirects only after the backend has revoked the session', async () => {
    authService.logout.mockResolvedValue(null);
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/auth?mode=login', { replace: true }));
    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  test('shows a retryable error when server logout fails', async () => {
    authService.logout.mockRejectedValue(new Error('Сессия не завершена'));
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Сессия не завершена');
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeEnabled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('does not overload the sidebar with destinations unavailable to the current role', () => {
    renderSidebar();

    expect(screen.queryByText('Отзывы')).not.toBeInTheDocument();
    expect(screen.queryByText('Репутация')).not.toBeInTheDocument();
    expect(screen.queryByText('Помощь')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });
});
