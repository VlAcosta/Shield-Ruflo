import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { authService } from '../../../services/auth/authService';
import PortalSidebar from './PortalSidebar';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../../../services/auth/authService', () => ({ authService: { logout: jest.fn() } }));
jest.mock('../../../features/access/hooks/useAccessControl', () => () => ({ can: () => false, role: { label: 'Аналитик' } }));
jest.mock('../../../services/access/rbacService', () => ({ findFirstAllowedRoute: () => '/dashboard' }));
jest.mock('../../../features/appearance/hooks/useAppearance', () => () => ({
  isDark: false,
  mode: 'light',
  toggleResolvedTheme: jest.fn(),
}));
jest.mock('../navigation', () => ({
  navigationItems: [{
    to: '/reviews',
    label: 'Отзывы',
    permission: 'reviews.view',
    Icon: () => null,
  }],
}));

describe('PortalSidebar logout', () => {
  beforeEach(() => {
    authService.logout.mockReset();
    mockNavigate.mockReset();
  });

  test('redirects only after the backend has revoked the session', async () => {
    authService.logout.mockResolvedValue(null);
    render(<MemoryRouter><PortalSidebar /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/auth?mode=login', { replace: true }));
    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  test('shows a retryable error when server logout fails', async () => {
    authService.logout.mockRejectedValue(new Error('Сессия не завершена'));
    render(<MemoryRouter><PortalSidebar /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Сессия не завершена');
    expect(screen.getByRole('button', { name: 'Выйти из аккаунта' })).toBeEnabled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('keeps a permission-locked destination focusable and explains why it cannot navigate', () => {
    render(<MemoryRouter><PortalSidebar /></MemoryRouter>);

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
