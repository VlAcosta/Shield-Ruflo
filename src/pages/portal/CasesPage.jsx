import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import CasesWorkspace from '../../features/cases/CasesWorkspace';

export default function CasesPage() {
  return (
    <PortalLayout title="Репутационные кейсы" subtitle="Reputation Operations">
      <CasesWorkspace />
    </PortalLayout>
  );
}
