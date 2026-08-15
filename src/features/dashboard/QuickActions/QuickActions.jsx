import React, { memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardCard from '../../../components/ui/DashboardCard';
import DashboardWidgetState from '../components/DashboardWidgetState';
import useAccessControl from '../../access/hooks/useAccessControl';
import './QuickActions.scss';

function TaskIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4" stroke="currentColor" strokeWidth="1.6" /><path d="M8.8 12.1L11 14.2L15.6 9.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function ReviewsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 6.8C5 5.25 6.25 4 7.8 4H16.2C17.75 4 19 5.25 19 6.8V12.2C19 13.75 17.75 15 16.2 15H10L6 18V15.1C5.4 14.58 5 13.82 5 12.95V6.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M12 7.1L12.7 8.5L14.25 8.73L13.13 9.82L13.4 11.36L12 10.63L10.6 11.36L10.87 9.82L9.75 8.73L11.3 8.5L12 7.1Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/></svg>;
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
  {
    id: 'task',
    label: 'Создать задачу',
    hint: 'Добавить в работу',
    Icon: TaskIcon,
    tone: 'violet',
    route: '/tasks',
    allowed: (access) => access.can('tasks.create') || access.can('tasks.manage'),
  },
  {
    id: 'reviews',
    label: 'Отзывы',
    hint: 'Открыть входящие',
    Icon: ReviewsIcon,
    tone: 'purple',
    route: '/reviews',
    allowed: (access) => access.can('reviews.view'),
  },
  {
    id: 'report',
    label: 'Отчёты',
    hint: 'Открыть аналитику',
    Icon: ReportIcon,
    tone: 'green',
    route: '/reports',
    allowed: (access) => access.can('reports.view'),
  },
  {
    id: 'support',
    label: 'Техподдержка',
    hint: 'Ошибки и интеграции',
    Icon: SupportIcon,
    tone: 'cyan',
    route: '/chat?channel=technical',
    allowed: (access) => access.can('support.write'),
  },
]);

function QuickActions() {
  const navigate = useNavigate();
  const access = useAccessControl();
  const availableActions = useMemo(
    () => ACTIONS.filter((action) => action.allowed(access)),
    [access]
  );
  const handleNavigate = useCallback((route) => navigate(route), [navigate]);

  return (
    <DashboardCard title="Быстрые действия" className="dashboard-quick-actions" motion="rise">
      {availableActions.length ? (
        <div className="dashboard-quick-actions__grid">
          {availableActions.map((action, index) => {
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
      ) : (
        <DashboardWidgetState
          compact
          title="Нет доступных быстрых действий"
          text="Набор действий зависит от прав вашей роли. Основные данные остаются доступны в разрешённых разделах кабинета."
        />
      )}
    </DashboardCard>
  );
}

export default memo(QuickActions);
