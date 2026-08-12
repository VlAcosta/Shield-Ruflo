import React, { useCallback } from 'react';
import PortalLayout from '../layouts/PortalLayout';
import DashboardWorkspace from '../features/dashboard/DashboardWorkspace';
import FirstRunExperience from '../features/dashboard/FirstRunExperience';
import DashboardDataProvider from '../features/dashboard/data/DashboardDataProvider';
import DashboardDataStatusBar from '../features/dashboard/data/DashboardDataStatusBar';
import useDashboardFirstRun from '../features/dashboard/hooks/useDashboardFirstRun';
import useOrganization from '../hooks/useOrganization';
import '../styles/dashboard.scss';

export default function DashboardPage() {
  const organization = useOrganization();
  const firstRun = useDashboardFirstRun();

  const scrollToWorkspace = useCallback(() => {
    document.getElementById('dashboard-workspace')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  return (
    <PortalLayout
      title="Главная"
      subtitle={organization.title || 'Организация'}
      requirePin
    >
      <DashboardDataProvider>
        <div className={`dashboard-page dashboard-page--phase2 ${firstRun.active ? 'dashboard-page--first-run' : ''}`.trim()}>
          {firstRun.active ? <FirstRunExperience onWorkspaceOpen={scrollToWorkspace} /> : null}
          {!firstRun.active ? <DashboardDataStatusBar /> : null}
          <DashboardWorkspace firstRun={firstRun.active} />
        </div>
      </DashboardDataProvider>
    </PortalLayout>
  );
}
