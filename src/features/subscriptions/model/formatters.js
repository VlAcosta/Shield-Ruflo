export function formatCurrency(value) {
  const safeValue = Number(value) || 0;
  return `${safeValue.toLocaleString('ru-RU')} ₽`;
}

export function getUsagePercent(used, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(used) / Number(total)) * 100)));
}

const PAYMENT_STATUS_LABELS = Object.freeze({
  paid: 'Оплачено',
  pending: 'Ожидает оплаты',
  canceled: 'Отменено',
  failed: 'Ошибка',
  refund: 'Возврат',
});

export function formatPaymentStatus(status) {
  return PAYMENT_STATUS_LABELS[status] || 'Статус неизвестен';
}
