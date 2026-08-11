import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import CompetitiveIntelligenceWorkspace from '../../features/competitive/CompetitiveIntelligenceWorkspace';

export default function CompetitiveIntelligencePage() {
  return (
    <PortalLayout title="Конкуренты" subtitle="Competitive Intelligence">
      <CompetitiveIntelligenceWorkspace />
    </PortalLayout>
  );
}
