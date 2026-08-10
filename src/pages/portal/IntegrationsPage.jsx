import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import IntegrationHubWorkspace from '../../features/integrations/IntegrationHub';
import GoogleBusinessProfileSetup from '../../features/integrations/GoogleBusinessProfile/GoogleBusinessProfileSetup';

export default function IntegrationsPage() {
  return (
    <PortalLayout title="Интеграции" subtitle="Provider Hub">
      <GoogleBusinessProfileSetup />
      <IntegrationHubWorkspace />
    </PortalLayout>
  );
}
