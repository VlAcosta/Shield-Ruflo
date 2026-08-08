import React, { useCallback, useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import { AdminTicketsWorkspace } from '../../features/admin/tickets';

export default function AdminTicketsPage() {
  const [refreshHandler, setRefreshHandler] = useState(null);
  const onRefreshReady = useCallback((handler) => setRefreshHandler(() => handler), []);
  return (
    <AdminLayout title="Тикеты" eyebrow="Поддержка" onRefresh={refreshHandler || undefined}>
      <AdminTicketsWorkspace onRefreshReady={onRefreshReady} />
    </AdminLayout>
  );
}
