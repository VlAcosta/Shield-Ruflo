import React, { useCallback, useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import { AdminClientsWorkspace } from '../../features/admin/clients';

export default function AdminClientsPage() {
  const [refreshHandler, setRefreshHandler] = useState(null);
  const onRefreshReady = useCallback((handler) => setRefreshHandler(() => handler), []);

  return (
    <AdminLayout
      title="Клиенты"
      eyebrow="Управление клиентами"
      onRefresh={refreshHandler || undefined}
    >
      <AdminClientsWorkspace onRefreshReady={onRefreshReady} />
    </AdminLayout>
  );
}
