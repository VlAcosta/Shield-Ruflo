import React, { memo, useMemo, useState } from 'react';
import PeriodMenu from '../../../components/ui/PeriodMenu';
import { DownloadIcon, ReceiptIcon } from '../model/icons';
import { formatCurrency, formatPaymentStatus } from '../model/formatters';
import './PaymentHistory.scss';

const FILTERS = Object.freeze([
  { value: 'all', label: 'Все операции' },
  { value: 'paid', label: 'Оплачено' },
  { value: 'refund', label: 'Возвраты' },
]);

function PaymentHistory({ payments, onDownload }) {
  const [filter, setFilter] = useState('all');

  const visiblePayments = useMemo(() => {
    if (filter === 'all') return payments;
    return payments.filter((item) => item.status === filter);
  }, [filter, payments]);

  return (
    <section className="payment-history">
      <div className="payment-history__head">
        <div className="payment-history__title">
          <span className="payment-history__icon"><ReceiptIcon /></span>
          <div>
            <span className="payment-history__eyebrow">Финансы</span>
            <h3>История платежей</h3>
          </div>
        </div>

        <PeriodMenu
          value={filter}
          options={FILTERS}
          onChange={setFilter}
          align="right"
          ariaLabel="Фильтр истории платежей"
        />
      </div>

      <div className="payment-history__table" role="table" aria-label="История платежей">
        <div className="payment-history__table-head" role="row">
          <span>Дата</span>
          <span>Описание</span>
          <span>Сумма</span>
          <span>Статус</span>
          <span aria-hidden="true" />
        </div>

        <div className="payment-history__body">
          {visiblePayments.map((item, index) => (
            <div
              className="payment-history__row"
              role="row"
              key={item.id}
              style={{ '--payment-index': index }}
            >
              <span className="payment-history__date">{item.date}</span>
              <strong className="payment-history__description">{item.title}</strong>
              <strong className="payment-history__amount">{formatCurrency(item.amount)}</strong>
              <span className={`payment-history__status payment-history__status--${item.status}`}>
                <i /> {formatPaymentStatus(item.status)}
              </span>
              <button
                type="button"
                className="payment-history__download"
                aria-label={`Скачать квитанцию: ${item.title}`}
                onClick={() => onDownload(item)}
              >
                <DownloadIcon />
              </button>
            </div>
          ))}

          {!visiblePayments.length ? (
            <div className="payment-history__empty">
              Операций с выбранным статусом пока нет.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default memo(PaymentHistory);
