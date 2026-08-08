import { useContext, useMemo } from 'react';
import { DashboardDataContext } from '../data/DashboardDataProvider';

export default function useDashboardData(section) {
  const context = useContext(DashboardDataContext);
  if (!context) throw new Error('useDashboardData must be used inside DashboardDataProvider');
  return useMemo(() => ({
    ...context,
    section: section ? context.data?.[section] : context.data,
  }), [context, section]);
}
