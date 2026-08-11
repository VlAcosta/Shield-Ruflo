import React from 'react';
import { useSearchParams } from 'react-router-dom';
import './SubscriptionUpgradeContext.scss';

const UPGRADE_CONTEXT = Object.freeze({
  'analytics.view': { section: 'Репутация', module: 'Аналитика и отчёты' },
  'reports.view': { section: 'Отчёты', module: 'Аналитика и отчёты' },
  'reports.create': { section: 'Отчёты', module: 'Аналитика и отчёты' },
  'reports.export': { section: 'Отчёты', module: 'Аналитика и отчёты' },
  'automations.view': { section: 'Автоматизации', module: 'Автоматизации' },
  'automations.manage': { section: 'Автоматизации', module: 'Автоматизации' },
  'competitive.view': { section: 'Конкуренты', module: 'Конкуренты' },
  'competitive.manage': { section: 'Конкуренты', module: 'Конкуренты' },
  'ai_visibility.view': { section: 'AI Visibility', module: 'AI-инструменты' },
  'ai_visibility.manage': { section: 'AI Visibility', module: 'AI-инструменты' },
  'ai_visibility.run': { section: 'AI Visibility', module: 'AI-инструменты' },
});

export default function SubscriptionUpgradeContext() {
  const [searchParams, setSearchParams] = useSearchParams();
  const permission = searchParams.get('upgrade') || '';
  const context = UPGRADE_CONTEXT[permission];

  if (!context) return null;

  const dismiss = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('upgrade');
    next.delete('from');
    setSearchParams(next, { replace: true });
  };

  return (
    <section className="subscription-upgrade-context" aria-label="Причина выбора тарифа">
      <span className="subscription-upgrade-context__mark">PRO</span>
      <div>
        <small>Открыть функцию</small>
        <h2>Для раздела «{context.section}» нужен расширенный тариф</h2>
        <p>
          Готовый PRO включает нужную возможность сразу. В Конструкторе добавьте модуль
          {' '}<strong>«{context.module}»</strong> — итоговую цену всё равно рассчитает сервер.
        </p>
      </div>
      <button type="button" onClick={dismiss} aria-label="Закрыть подсказку о тарифе">×</button>
    </section>
  );
}
