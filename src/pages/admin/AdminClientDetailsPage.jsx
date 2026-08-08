import React, { useCallback, useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import { AdminClientDetailsWorkspace } from '../../features/admin/clients';

export default function AdminClientDetailsPage() {
  const [refreshHandler, setRefreshHandler] = useState(null);
  const onRefreshReady = useCallback((handler) => setRefreshHandler(() => handler), []);

  return (
    <AdminLayout
      title="Клиенты"
      eyebrow="Управление клиентами"
      onRefresh={refreshHandler || undefined}
    >
      <AdminClientDetailsWorkspace onRefreshReady={onRefreshReady} />
    </AdminLayout>
  );
}
