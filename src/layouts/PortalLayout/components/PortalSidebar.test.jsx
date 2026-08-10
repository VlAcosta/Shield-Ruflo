import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  navigationItems: [{
    to: '/reviews',
    label: 'Отзывы',
    permission: 'reviews.view',
    Icon: () => null,
  }],
}));

function renderSidebar() {
  return render(
    <MemoryRouter future={routerFuture}>
      <PortalSidebar />
    </MemoryRouter>,
  );
}

describe('PortalSidebar logout', () => {
  beforeEach(() => {
    authService.logout.mockReset();
    mockNavigate.mockReset();
  });

  test('redirects only after the backend has revoked the session', async () => {
    authService.logout.mockResolvedValue(null);
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/auth?mode=login', { replace: true }));
    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  test('shows a retryable error when server logout fails', async () => {
    authService.logout.mockRejectedValue(new Error('Сессия не завершена'));
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Сессия не завершена');
    expect(screen.getByRole('button', { name: 'Выйти из аккаунта' })).toBeEnabled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('keeps a permission-locked destination focusable and explains why it cannot navigate', () => {
    renderSidebar();

    const locked = screen.getByRole('button', { name: /Отзывы/ });
    expect(locked).not.toBeDisabled();
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    act(() => locked.focus());
    expect(locked).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Нет доступа. Текущая роль: Аналитик');
    fireEvent.click(locked);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
