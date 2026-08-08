import React, { useCallback, useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import { AdminDashboardWorkspace, ADMIN_DASHBOARD_SEARCH } from '../../features/admin/dashboard';

export default function AdminDashboardPage() {
  const [refreshHandler, setRefreshHandler] = useState(null);
  const onRefreshReady = useCallback((handler) => setRefreshHandler(() => handler), []);

  return (
    <AdminLayout
      title="Дашборд"
      eyebrow="Обзор системы"
      searchItems={ADMIN_DASHBOARD_SEARCH}
      onRefresh={refreshHandler || undefined}
    >
      <AdminDashboardWorkspace onRefreshReady={onRefreshReady} />
    </AdminLayout>
  );
}
