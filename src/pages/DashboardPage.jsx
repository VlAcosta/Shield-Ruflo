import React, { useCallback } from 'react';
import PortalLayout from '../layouts/PortalLayout';
import { DashboardPulseHero, HeaderAnalytick } from '../features/dashboard';
import DashboardWorkspace from '../features/dashboard/DashboardWorkspace';
import FirstRunExperience from '../features/dashboard/FirstRunExperience';
import DashboardDataProvider from '../features/dashboard/data/DashboardDataProvider';
import DashboardDataStatusBar from '../features/dashboard/data/DashboardDataStatusBar';
import useDashboardFirstRun from '../features/dashboard/hooks/useDashboardFirstRun';
import useDashboardTheme from '../features/dashboard/hooks/useDashboardTheme';
import useDashboardGridMenuAccessibility from '../features/dashboard/hooks/useDashboardGridMenuAccessibility';
import useDashboardWorkspaceAccessibility from '../features/dashboard/hooks/useDashboardWorkspaceAccessibility';
import useOrganization from '../hooks/useOrganization';
import '../styles/dashboard.scss';
import '../styles/dashboard-responsive.scss';
import '../styles/dashboard-phase2.scss';
import '../styles/dashboard-source-state.scss';
import '../styles/dashboard-phase3.scss';
import '../styles/dashboard-interactions.scss';

export default function DashboardPage() {
  const organization = useOrganization();
  const firstRun = useDashboardFirstRun();
  const dashboardTheme = useDashboardTheme();
  useDashboardGridMenuAccessibility();
  useDashboardWorkspaceAccessibility();

  const scrollToWorkspace = useCallback(() => {
    document.getElementById('dashboard-workspace')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  return (
    <PortalLayout
      title="Главная страница"
      subtitle={organization.title || 'Организация'}
      requirePin
    >
      <DashboardDataProvider>
        <div className={`dashboard-page ${firstRun.active ? 'dashboard-page--first-run' : ''} ${dashboardTheme.isDark ? 'is-dark' : 'is-light'}`.trim()}>
          {firstRun.active ? (
            <FirstRunExperience onWorkspaceOpen={scrollToWorkspace} />
          ) : (
            <DashboardPulseHero organizationName={organization.title || 'Организация'} />
          )}
          {!firstRun.active ? <DashboardDataStatusBar /> : null}
          {firstRun.active ? <HeaderAnalytick firstRun connectedCount={firstRun.integrations?.length || 0} /> : null}
          <DashboardWorkspace firstRun={firstRun.active} />
        </div>
      </DashboardDataProvider>
    </PortalLayout>
  );
}
