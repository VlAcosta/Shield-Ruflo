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
    if (status === 'offline') return { tone: 'warning', label: 'Нет соединения', text: 'Показываем последние сохранённые данные. После восстановления связи кабинет обновится автоматически.' };
    if (status === 'error') return { tone: 'danger', label: 'Не удалось обновить данные', text: 'Последние доступные данные сохранены. Попробуйте повторить загрузку.' };
    if (status === 'stale') return { tone: 'warning', label: 'Данные обновляются', text: `Показываем предыдущую версию${formatTime(fetchedAt) ? ` от ${formatTime(fetchedAt)}` : ''}, пока восстанавливаем актуальное состояние.` };
    if (source === 'local-demo') return { tone: 'neutral', label: 'Демонстрационный режим', text: 'Сейчас отображаются демонстрационные данные. Подключите организацию и площадки, чтобы увидеть реальные показатели.' };
    if (!apiEnabled || source === 'local') return { tone: 'neutral', label: 'Локальные данные', text: 'Часть показателей доступна только на этом устройстве. После подключения серверной синхронизации они будут доступны всей команде.' };
    return null;
  }, [apiEnabled, fetchedAt, source, status]);

  if (!model) return null;

  return (
    <div className={`dashboard-data-status is-${model.tone}`} role="status">
      <span className="dashboard-data-status__dot" aria-hidden="true" />
      <strong>{model.label}</strong>
      <span>{model.text}</span>
      <button type="button" onClick={refresh} disabled={refreshing}>{refreshing ? 'Обновляем…' : 'Повторить'}</button>
    </div>
  );
}
export default memo(DashboardDataStatusBar);
