import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import IntegrationHubWorkspace from '../../features/integrations/IntegrationHub';

export default function IntegrationsPage() {
  return <PortalLayout title="Интеграции" subtitle="Provider Hub"><IntegrationHubWorkspace /></PortalLayout>;
}
