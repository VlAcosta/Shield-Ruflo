import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import ReputationIntelligenceWorkspace from '../../features/reputation/ReputationIntelligenceWorkspace';

export default function ReputationPage() {
  return <PortalLayout title="Репутация" subtitle="Intelligence"><ReputationIntelligenceWorkspace /></PortalLayout>;
}
