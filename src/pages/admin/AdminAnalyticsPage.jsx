import React, { useCallback, useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import { AdminAnalyticsWorkspace } from '../../features/admin/analytics';

export default function AdminAnalyticsPage() {
  const [refreshHandler,setRefreshHandler] = useState(null);
  const onRefreshReady = useCallback((handler)=>setRefreshHandler(()=>handler),[]);
  return <AdminLayout title="Аналитика" eyebrow="Метрики и отчёты" onRefresh={refreshHandler||undefined}><AdminAnalyticsWorkspace onRefreshReady={onRefreshReady}/></AdminLayout>;
}
