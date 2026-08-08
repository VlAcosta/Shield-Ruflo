import React, { memo } from 'react';
import Progress from '../../../components/ui/Progress';
import { getUsagePercent } from '../model/formatters';
import './PlanLimits.scss';

function PlanLimits({ limits }) {
  return (
    <section className="plan-limits">
      <div className="plan-limits__head">
        <div>
          <span className="plan-limits__eyebrow">Использование</span>
          <h3>Лимиты тарифа</h3>
        </div>
        <span className="plan-limits__caption">Текущий период</span>
      </div>

      <div className="plan-limits__list">
        {limits.map((item, index) => {
          const percent = getUsagePercent(item.used, item.total);
          const warning = percent >= 80;

          return (
            <div
              className={`plan-limits__item ${warning ? 'is-warning' : ''}`}
              key={item.id}
              style={{ '--limit-index': index }}
            >
              <div className="plan-limits__row">
                <span>{item.label}</span>
                <strong>{item.used}<small>/ {item.total}</small></strong>
              </div>

              <Progress value={percent} tone={item.tone === 'purple' ? 'violet' : item.tone} />

              <div className="plan-limits__foot">
                <span>{percent}% использовано</span>
                {warning ? <em>Пора докупить</em> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default memo(PlanLimits);
