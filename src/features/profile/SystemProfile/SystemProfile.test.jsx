import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SystemProfile from './SystemProfile';

let automationState = 'plan_locked';
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

vi.mock('../../integrations/GoogleBusinessProfile/GoogleBusinessProfileSetup', () => ({ default: () => <div>Google setup</div> }));
vi.mock('../../integrations/IntegrationHub', () => ({ default: () => <div>Integration hub</div> }));
vi.mock('../../automations/AutomationsWorkspace', () => ({ default: () => <div>Automation workspace</div> }));
vi.mock('../../../services/access/planAccessService', () => ({
  getPermissionAccessState: () => automationState,
}));

const access = {
  can: (permission) => ['integrations.view', 'billing.view'].includes(permission),
};

function renderSystem(entry) {
  return render(
    <MemoryRouter future={routerFuture} initialEntries={[entry]}>
      <SystemProfile access={access} />
    </MemoryRouter>,
  );
}

describe('SystemProfile', () => {
  test('renders existing integration workspaces inside settings', () => {
    automationState = 'plan_locked';
    renderSystem('/profile?tab=system&section=integrations');

    expect(screen.getByText('Google setup')).toBeInTheDocument();
    expect(screen.getByText('Integration hub')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Автоматизации · доступно в PRO' })).toBeInTheDocument();
  });

  test('shows a PRO upgrade state instead of mounting automations on FREE', () => {
    automationState = 'plan_locked';
    renderSystem('/profile?tab=system&section=automations');

    expect(screen.getByText('Правила и сценарии доступны в PRO')).toBeInTheDocument();
    expect(screen.queryByText('Automation workspace')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Посмотреть тарифы' })).toBeInTheDocument();
  });

  test('mounts the real automations workspace when the server permission is granted', () => {
    automationState = 'allowed';
    renderSystem('/profile?tab=system&section=automations');

    expect(screen.getByText('Automation workspace')).toBeInTheDocument();
  });
});
