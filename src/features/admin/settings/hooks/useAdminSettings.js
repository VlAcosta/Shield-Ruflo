import { useCallback, useEffect, useState } from 'react';
import {
  deleteAdminTemplate,
  getAdminSettings,
  saveAdminPlanFromSettings,
  saveAdminSettingsSection,
  saveAdminTemplate,
  testAdminSmtp,
  toggleAdminIntegration,
} from '../../../../services/admin/adminSettingsService';

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
    saveSection:(section,value)=>perform(()=>saveAdminSettingsSection(section,value)),
    savePlan:(id,patch)=>perform(()=>saveAdminPlanFromSettings(id,patch)),
    toggleIntegration:(id)=>perform(()=>toggleAdminIntegration(id)),
    saveTemplate:(template)=>perform(()=>saveAdminTemplate(template)),
    deleteTemplate:(id)=>perform(()=>deleteAdminTemplate(id)),
    testSmtp:(smtp)=>perform(()=>testAdminSmtp(smtp)),
  };
}
