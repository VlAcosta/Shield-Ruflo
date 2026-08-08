import React, { memo, useMemo } from 'react';
import useDashboardData from '../hooks/useDashboardData';
import './DashboardDataStatusBar.scss';

function formatTime(timestamp) {
  if (!timestamp) return '';
  try { return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)); } catch { return ''; }
}

function DashboardDataStatusBar() {
  const { status, source, fetchedAt, refreshing, refresh, apiEnabled } = useDashboardData();
  const model = useMemo(() => {
    if (status === 'offline') return { tone: 'warning', label: 'Офлайн', text: 'Показываем последнюю доступную версию данных.' };
    if (status === 'error') return { tone: 'danger', label: 'Ошибка данных', text: 'Не удалось получить данные рабочего пространства.' };
    if (status === 'stale') return { tone: 'warning', label: 'Данные устарели', text: 'Показываем кэш и восстанавливаем соединение.' };
    if (source === 'local-demo') return { tone: 'neutral', label: 'Demo data', text: 'Показываем локальные демонстрационные данные. В production они отключаются автоматически.' };
    if (!apiEnabled || source === 'local') return { tone: 'neutral', label: 'Локальный режим', text: 'Данные собраны из локального состояния модулей. Подключите Dashboard API для server-state.' };
    return { tone: 'success', label: 'Live data', text: `Последнее обновление ${formatTime(fetchedAt)}` };
  }, [apiEnabled, fetchedAt, source, status]);

  return (
    <div className={`dashboard-data-status is-${model.tone}`} role="status">
      <span className="dashboard-data-status__dot" aria-hidden="true" />
      <strong>{model.label}</strong>
      <span>{model.text}</span>
      <button type="button" onClick={refresh} disabled={refreshing}>{refreshing ? 'Обновляем…' : 'Обновить'}</button>
    </div>
  );
}
export default memo(DashboardDataStatusBar);
