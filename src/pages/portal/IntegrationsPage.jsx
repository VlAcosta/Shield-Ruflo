import React from 'react';
import { Navigate } from 'react-router-dom';

export default function IntegrationsPage() {
  return <Navigate to="/profile?tab=system&section=integrations" replace />;
}
