import React, { useCallback, useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import { AdminSubscriptionsWorkspace } from '../../features/admin/subscriptions';

export default function AdminSubscriptionsPage() {
  const [refreshHandler,setRefreshHandler] = useState(null);
  const onRefreshReady = useCallback((handler)=>setRefreshHandler(()=>handler),[]);
  return <AdminLayout title="Подписки" eyebrow="Тарифы и платежи" onRefresh={refreshHandler||undefined}><AdminSubscriptionsWorkspace onRefreshReady={onRefreshReady}/></AdminLayout>;
}
