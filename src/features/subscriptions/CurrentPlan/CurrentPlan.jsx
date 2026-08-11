import React, { memo } from 'react';
import { CrownIcon, SparkIcon } from '../model/icons';
import { formatCurrency } from '../model/formatters';
import './CurrentPlan.scss';

function formatActiveUntil(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function CurrentPlan({ plan, canManage = true }) {
  const activeUntil = formatActiveUntil(plan.activeUntil);
  const isFree = Number(plan.price || 0) <= 0;

  return (
    <section className="current-plan">
      <div className="current-plan__glow current-plan__glow--one" />
      <div className="current-plan__glow current-plan__glow--two" />

      <div className="current-plan__content">
        <span className="current-plan__eyebrow">Текущий тариф</span>

        <div className="current-plan__title-row">
          <span className="current-plan__crown"><CrownIcon /></span>
          <h2>{plan.name}</h2>
          <span className="current-plan__badge"><SparkIcon /> Активен</span>
        </div>

        <div className="current-plan__meta">
          <span>{activeUntil ? <>Активен до <strong>{activeUntil}</strong></> : <strong>Без срока действия</strong>}</span>
          <span className="current-plan__divider" aria-hidden="true" />
          <span><strong>{formatCurrency(plan.price)}</strong> / {plan.billingLabel}</span>
        </div>

        <div className="current-plan__actions">
          {canManage ? (
            <span className="current-plan__management-note">Сменить тариф или собрать конфигурацию можно ниже</span>
          ) : (
            <span className="current-plan__readonly">Только просмотр</span>
          )}
        </div>
      </div>

      <div className="current-plan__renewal">
        <div>
          <span>{isFree ? 'Оплата не требуется' : 'Оплата периода'}</span>
          <small>{isFree ? 'Бесплатный тариф · автоматических списаний нет' : 'Автосписание пока не подключено · следующий период оформляется вручную'}</small>
        </div>
        <span className="current-plan__manual-mark" aria-hidden="true">{isFree ? '0 ₽' : 'ручн.'}</span>
      </div>
    </section>
  );
}

export default memo(CurrentPlan);
