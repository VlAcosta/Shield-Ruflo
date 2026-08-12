import React from 'react';
import { Navigate } from 'react-router-dom';

export default function AutomationsPage() {
  return <Navigate to="/profile?tab=system&section=automations" replace />;
}
