import React, { useCallback, useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import { AdminSettingsWorkspace } from '../../features/admin/settings';

export default function AdminSettingsPage() {
  const [refreshHandler,setRefreshHandler] = useState(null);
  const onRefreshReady = useCallback((handler)=>setRefreshHandler(()=>handler),[]);
  return <AdminLayout title="Настройки" eyebrow="Конфигурация" onRefresh={refreshHandler||undefined}><AdminSettingsWorkspace onRefreshReady={onRefreshReady}/></AdminLayout>;
}
