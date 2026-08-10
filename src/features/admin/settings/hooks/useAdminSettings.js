import { useCallback, useEffect, useState } from 'react';
import {
  createAdminReplyTemplate,
  deleteAdminReplyTemplate,
  getAdminSettings,
  testAdminSmtp,
  toggleAdminIntegration,
  updateAdminReplyTemplate,
  updateAdminSettings,
} from '../../../../services/admin/adminSettingsService';
import { updateAdminPlan } from '../../../../services/admin/adminSubscriptionsService';

export default function useAdminSettings() {
  const [data,setData] = useState(null);
  const [error,setError] = useState('');
  const [refreshing,setRefreshing] = useState(true);
  const [saving,setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true); setError('');
    try { setData(await getAdminSettings()); }
    catch (err) { setError(err?.message || 'Не удалось загрузить настройки'); }
    finally { setRefreshing(false); }
  },[]);

  useEffect(()=>{ refresh(); },[refresh]);

  const perform = useCallback(async (action) => {
    setSaving(true); setError('');
    try { const result = await action(); await refresh(); return result; }
    catch (err) { setError(err?.message || 'Не удалось сохранить настройки'); throw err; }
    finally { setSaving(false); }
  },[refresh]);

  return {
    data,error,refreshing,saving,refresh,
    saveSection:(section,value)=>perform(()=>updateAdminSettings(section,value)),
    savePlan:(id,patch)=>perform(()=>updateAdminPlan(id,patch)),
    toggleIntegration:(id,enabled)=>perform(()=>toggleAdminIntegration(id,enabled)),
    saveTemplate:(template)=>perform(() => template.id
      ? updateAdminReplyTemplate(template.id, template)
      : createAdminReplyTemplate(template)),
    deleteTemplate:(id)=>perform(()=>deleteAdminReplyTemplate(id)),
    testSmtp:()=>perform(()=>testAdminSmtp()),
  };
}
