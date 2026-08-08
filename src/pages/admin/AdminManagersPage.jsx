import React, { useCallback, useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import { AdminManagersWorkspace } from '../../features/admin/managers';

export default function AdminManagersPage() {
  const [refreshHandler, setRefreshHandler] = useState(null);
  const onRefreshReady = useCallback((handler) => setRefreshHandler(() => handler), []);

  return (
    <AdminLayout title="Менеджеры" eyebrow="Команда" onRefresh={refreshHandler || undefined}>
      <AdminManagersWorkspace onRefreshReady={onRefreshReady} />
    </AdminLayout>
  );
}
