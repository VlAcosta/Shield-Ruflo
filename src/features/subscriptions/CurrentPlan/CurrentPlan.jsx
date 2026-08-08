import React, { memo } from 'react';
import Button from '../../../components/ui/Button';
import { CrownIcon, SparkIcon } from '../model/icons';
import { formatCurrency } from '../model/formatters';
import './CurrentPlan.scss';

function CurrentPlan({ plan, renewalBusy, onToggleRenewal, canManage = true }) {
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
          <span>Активна до <strong>{plan.activeUntil}</strong></span>
          <span className="current-plan__divider" aria-hidden="true" />
          <span><strong>{formatCurrency(plan.price)}</strong> / {plan.billingLabel}</span>
        </div>

        {canManage ? <div className="current-plan__actions"><Button variant="ghost" className="current-plan__change">Сменить тариф</Button><Button variant="outline" className="current-plan__renew">Продлить</Button></div> : <div className="current-plan__actions"><span className="current-plan__readonly">Только просмотр</span></div>}
      </div>

      <div className="current-plan__renewal">
        <div>
          <span>Автопродление</span>
          <small>{plan.autoRenew ? 'Следующее списание включено' : 'Продление вручную'}</small>
        </div>

        <button
          type="button"
          className={`current-plan__switch ${plan.autoRenew ? 'is-on' : ''} ${renewalBusy ? 'is-busy' : ''}`}
          role="switch"
          aria-checked={plan.autoRenew}
          aria-label="Автопродление подписки"
          disabled={renewalBusy || !canManage}
          onClick={canManage ? onToggleRenewal : undefined}
          title={!canManage ? 'Нет права управлять подпиской' : undefined}
        >
          <span />
        </button>
      </div>
    </section>
  );
}

export default memo(CurrentPlan);
