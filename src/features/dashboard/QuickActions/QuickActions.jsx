import React, { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardCard from '../../../components/ui/DashboardCard';
import './QuickActions.scss';

function TaskIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4" stroke="currentColor" strokeWidth="1.6" /><path d="M8.8 12.1L11 14.2L15.6 9.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function ChatIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7.5C5 5.57 6.57 4 8.5 4H15.5C17.43 4 19 5.57 19 7.5V12.5C19 14.43 17.43 16 15.5 16H10L6 19V16.15C5.4 15.52 5 14.66 5 13.7V7.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
}
function ReportIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 19V5M6 19H19M10 15V11M14 15V8M18 15V6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}
function SupportIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5.5 12V10.5C5.5 6.91 8.41 4 12 4C15.59 4 18.5 6.91 18.5 10.5V12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M5.5 11H7.5V16H5.5C4.67 16 4 15.33 4 14.5V12.5C4 11.67 4.67 11 5.5 11Z" stroke="currentColor" strokeWidth="1.6"/><path d="M18.5 11H16.5V16H18.5C19.33 16 20 15.33 20 14.5V12.5C20 11.67 19.33 11 18.5 11Z" stroke="currentColor" strokeWidth="1.6"/><path d="M16.5 16C16.5 18 15 19 13.5 19H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
}
function ArrowIcon() {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5.25 3.75L9.5 8L5.25 12.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const ACTIONS = Object.freeze([
  { id: 'task', label: 'Создать задачу', hint: 'Добавить в работу', Icon: TaskIcon, tone: 'violet', route: '/tasks' },
  { id: 'manager', label: 'Менеджер', hint: 'Стратегия и аккаунт', Icon: ChatIcon, tone: 'purple', route: '/chat?channel=manager' },
  { id: 'report', label: 'Отчёты', hint: 'Открыть аналитику', Icon: ReportIcon, tone: 'green', route: '/reports' },
  { id: 'support', label: 'Техподдержка', hint: 'Ошибки и интеграции', Icon: SupportIcon, tone: 'cyan', route: '/chat?channel=technical' },
]);

function QuickActions() {
  const navigate = useNavigate();
  const handleNavigate = useCallback((route) => navigate(route), [navigate]);

  return (
    <DashboardCard title="Быстрые действия" className="dashboard-quick-actions" motion="rise">
      <div className="dashboard-quick-actions__grid">
        {ACTIONS.map((action, index) => {
          const Icon = action.Icon;
          return (
            <button
              className={`dashboard-quick-actions__item is-${action.tone}`}
              type="button"
              key={action.id}
              onClick={() => handleNavigate(action.route)}
              style={{ '--quick-index': index }}
            >
              <span className="dashboard-quick-actions__icon"><Icon /></span>
              <span className="dashboard-quick-actions__copy">
                <strong>{action.label}</strong>
                <small>{action.hint}</small>
              </span>
              <span className="dashboard-quick-actions__arrow"><ArrowIcon /></span>
            </button>
          );
        })}
      </div>
    </DashboardCard>
  );
}

export default memo(QuickActions);
