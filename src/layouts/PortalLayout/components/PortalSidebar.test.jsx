import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PortalSidebar from './PortalSidebar';

const toggleTheme = vi.fn();
const permissionAccessState = vi.fn();
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

vi.mock('../../../features/access/hooks/useAccessControl', () => ({
  default: () => ({ can: () => false, role: { label: 'Аналитик' } }),
}));
vi.mock('../../../services/access/rbacService', () => ({ findFirstAllowedRoute: () => '/dashboard' }));
vi.mock('../../../services/access/planAccessService', () => ({
  getPermissionAccessState: (permission) => permissionAccessState(permission),
}));
vi.mock('../../../features/appearance/hooks/useAppearance', () => ({
  default: () => ({
    isDark: false,
    mode: 'light',
    toggleResolvedTheme: toggleTheme,
  }),
}));
vi.mock('../navigation', () => ({
  navigationPrimary: [
    { to: '/dashboard', label: 'Главная', Icon: () => null },
    { to: '/reviews', label: 'Отзывы', permission: 'reviews.view', Icon: () => null },
  ],
  navigationHelp: { to: '/faq', label: 'Помощь', permission: 'support.view', Icon: () => null },
}));

function renderSidebar(props = {}) {
  return render(
    <MemoryRouter future={routerFuture} initialEntries={['/dashboard']}>
      <PortalSidebar {...props} />
    </MemoryRouter>,
  );
}

describe('PortalSidebar compact navigation', () => {
  beforeEach(() => {
    toggleTheme.mockReset();
    permissionAccessState.mockReset();
    permissionAccessState.mockReturnValue('role_denied');
  });

  test('shows only destinations allowed for the current role', () => {
    renderSidebar();

    expect(screen.getByText('Главная')).toBeInTheDocument();
    expect(screen.queryByText('Отзывы')).not.toBeInTheDocument();
    expect(screen.queryByText('Помощь')).not.toBeInTheDocument();
  });

  test('keeps plan-locked destinations visible with a compact PRO badge', () => {
    permissionAccessState.mockImplementation((permission) => (
      permission === 'reviews.view' ? 'plan_locked' : 'role_denied'
    ));
    renderSidebar();

    expect(screen.getByRole('link', { name: 'Отзывы · доступно в PRO' })).toBeInTheDocument();
    expect(screen.getByText('PRO')).toBeInTheDocument();
  });

  test('does not duplicate logout or cabinet lock actions in the sidebar', () => {
    renderSidebar();

    expect(screen.queryByRole('button', { name: /Выйти/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Заблокировать/i })).not.toBeInTheDocument();
  });

  test('keeps theme control as a low-priority utility action', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Включить тёмную тему' }));
    expect(toggleTheme).toHaveBeenCalledTimes(1);
  });

  test('replaces normal navigation with onboarding guidance while setup is locked', () => {
    renderSidebar({ navigationLocked: true });

    expect(screen.getByText('Настройка организации')).toBeInTheDocument();
    expect(screen.queryByText('Главная')).not.toBeInTheDocument();
  });
});
