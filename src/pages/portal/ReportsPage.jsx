import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import { ReportsWorkspace } from '../../features/reports';

export default function ReportsPage() {
  return (
    <PortalLayout title="Отчёты" subtitle="Аналитика">
      <ReportsWorkspace />
    </PortalLayout>
  );
}
