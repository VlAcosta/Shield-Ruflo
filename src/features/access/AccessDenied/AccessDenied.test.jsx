import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AccessDenied from './AccessDenied';

let state = 'plan_locked';
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

vi.mock('../hooks/useAccessControl', () => ({
  default: () => ({
    roleId: 'OWNER',
    can: (permission) => permission === 'billing.view',
  }),
}));
vi.mock('../../../services/access/rbacService', () => ({
  findFirstAllowedRoute: () => '/dashboard',
  getRoleLabel: () => 'Владелец',
  getRoutePermission: () => 'analytics.view',
}));
vi.mock('../../../services/access/planAccessService', () => ({
  getPermissionAccessState: () => state,
}));

function renderDenied() {
  return render(
    <MemoryRouter future={routerFuture} initialEntries={['/access-denied?from=%2Freputation']}>
      <AccessDenied />
    </MemoryRouter>,
  );
}

describe('AccessDenied plan-aware messaging', () => {
  test('shows an upgrade state when the role is allowed but the plan is not', () => {
    state = 'plan_locked';
    renderDenied();

    expect(screen.getByText('Функция доступна в PRO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Посмотреть тарифы' })).toBeInTheDocument();
    expect(screen.queryByText('Этот раздел закрыт вашей ролью')).not.toBeInTheDocument();
  });

  test('keeps true role denials as access-control errors', () => {
    state = 'role_denied';
    renderDenied();

    expect(screen.getByText('Этот раздел закрыт вашей ролью')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть доступный раздел' })).toBeInTheDocument();
  });
});
