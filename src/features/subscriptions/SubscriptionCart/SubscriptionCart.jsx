import React, { memo } from 'react';
import Button from '../../../components/ui/Button';
import { CartIcon, CheckIcon, TagIcon } from '../model/icons';
import { formatCurrency } from '../model/formatters';
import './SubscriptionCart.scss';

function SubscriptionCart({
  items,
  subtotal,
  discount,
  total,
  totalItems,
  promoInput,
  promo,
  promoBusy,
  checkoutBusy,
  onPromoChange,
  onApplyPromo,
  onRemovePromo,
  onCheckout,
}) {
  const hasItems = items.length > 0;

  return (
    <section className={`subscription-cart ${hasItems ? 'has-items' : 'is-empty'}`}>
      <div className="subscription-cart__left">
        <div className="subscription-cart__title-row">
          <div>
            <span className="subscription-cart__eyebrow">Текущий заказ</span>
            <h4>Корзина {totalItems ? <em>{totalItems}</em> : null}</h4>
          </div>

          {hasItems ? <span className="subscription-cart__ready"><CheckIcon /> Готово к оплате</span> : null}
        </div>

        {hasItems ? (
          <div className="subscription-cart__items">
            {items.map((item) => (
              <div className="subscription-cart__item" key={item.id}>
                <span className="subscription-cart__item-icon"><CartIcon /></span>
                <div className="subscription-cart__item-copy">
                  <strong>{item.title}</strong>
                  <span>{item.count} × {formatCurrency(item.price)}</span>
                </div>
                <strong className="subscription-cart__item-total">{formatCurrency(item.total)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="subscription-cart__empty">
            <span><CartIcon /></span>
            <div>
              <strong>Корзина пока пустая</strong>
              <p>Выберите дополнительные пакеты выше — они появятся здесь автоматически.</p>
            </div>
          </div>
        )}
      </div>

      <div className="subscription-cart__right">
        <div className={`subscription-cart__promo ${promo.valid ? 'is-applied' : ''}`}>
          <div className="subscription-cart__promo-field">
            <TagIcon />
            <input
              value={promoInput}
              onChange={(event) => onPromoChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onApplyPromo();
              }}
              placeholder="Промокод"
              aria-label="Промокод"
            />
            {promo.valid ? <span>{promo.percent}%</span> : null}
          </div>

          {promo.valid ? (
            <button type="button" className="subscription-cart__promo-remove" onClick={onRemovePromo}>
              Убрать
            </button>
          ) : (
            <button
              type="button"
              className="subscription-cart__promo-button"
              onClick={onApplyPromo}
              disabled={promoBusy || !hasItems}
            >
              {promoBusy ? '…' : 'OK'}
            </button>
          )}
        </div>

        <div className="subscription-cart__summary">
          <div>
            <span>Сумма</span>
            <strong>{formatCurrency(subtotal)}</strong>
          </div>

          {promo.valid ? (
            <div className="subscription-cart__discount">
              <span>Скидка · {promo.code}</span>
              <strong>−{formatCurrency(discount)}</strong>
            </div>
          ) : null}

          <div className="subscription-cart__total">
            <span>Итого</span>
            <strong>{formatCurrency(total)}</strong>
          </div>
        </div>

        <Button
          className="subscription-cart__pay"
          disabled={!hasItems || checkoutBusy}
          onClick={onCheckout}
        >
          {checkoutBusy ? 'Создаём заказ…' : `Оплатить ${formatCurrency(total)}`}
        </Button>
      </div>
    </section>
  );
}

export default memo(SubscriptionCart);
