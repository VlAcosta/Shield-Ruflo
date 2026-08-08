import React, { memo } from 'react';
import { PACKAGE_ICON_MAP } from '../model/icons';
import { formatCurrency } from '../model/formatters';
import './PackageStore.scss';

function PackageStore({ packages, cart, onChangeCount, onSetCount }) {
  return (
    <section className="package-store">
      <div className="package-store__head">
        <div>
          <span className="package-store__eyebrow">Дополнительные возможности</span>
          <h3>Докупка пакетов</h3>
        </div>
        <p>Добавляйте только то, что нужно сейчас — без смены тарифа.</p>
      </div>

      <div className="package-store__grid">
        {packages.map((item, index) => {
          const Icon = PACKAGE_ICON_MAP[item.icon];
          const count = Number(cart[item.id]) || 0;

          return (
            <article
              className={`package-card package-card--${item.tone} ${count > 0 ? 'is-selected' : ''}`}
              key={item.id}
              style={{ '--package-index': index }}
            >
              <div className="package-card__top">
                <span className="package-card__icon">{Icon ? <Icon /> : null}</span>
                {count > 0 ? <span className="package-card__selected">В корзине · {count}</span> : null}
              </div>

              <div className="package-card__copy">
                <h4>{item.title}</h4>
                <p>{item.description}</p>
              </div>

              <div className="package-card__bottom">
                <strong>{formatCurrency(item.price)}</strong>

                <div className="package-card__counter" aria-label={`Количество: ${item.title}`}>
                  <button
                    type="button"
                    onClick={() => onChangeCount(item.id, -1)}
                    disabled={count <= 0}
                    aria-label={`Уменьшить количество ${item.title}`}
                  >
                    −
                  </button>

                  <input
                    value={count}
                    inputMode="numeric"
                    aria-label={`Количество ${item.title}`}
                    onChange={(event) => onSetCount(item.id, event.target.value.replace(/\D/g, ''))}
                  />

                  <button
                    type="button"
                    onClick={() => onChangeCount(item.id, 1)}
                    aria-label={`Добавить ${item.title}`}
                  >
                    +
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default memo(PackageStore);
