export const DEFAULT_SUBSCRIPTION_SNAPSHOT = Object.freeze({
  plan: {
    id: 'professional',
    name: 'Профессионал',
    price: 4990,
    billingLabel: 'месяц',
    activeUntil: '17.02.2026',
    autoRenew: true,
  },
  limits: [
    { id: 'replies', label: 'Ответы на отзывы', used: 47, total: 100, tone: 'violet' },
    { id: 'reports', label: 'Отчёты', used: 8, total: 10, tone: 'purple' },
    { id: 'consultations', label: 'Консультации', used: 1, total: 3, tone: 'green' },
    { id: 'tasks', label: 'Задачи', used: 78, total: 200, tone: 'orange' },
  ],
  packages: [
    {
      id: 'review-pack',
      title: 'Пакет отзывов',
      description: '50 дополнительных ответов',
      price: 990,
      tone: 'violet',
      icon: 'message',
    },
    {
      id: 'report-pack',
      title: 'Пакет отчётов',
      description: '10 расширенных отчётов',
      price: 1490,
      tone: 'purple',
      icon: 'chart',
    },
    {
      id: 'consultation',
      title: 'Консультация',
      description: '1 видеоконсультация · 60 мин',
      price: 2490,
      tone: 'green',
      icon: 'camera',
    },
    {
      id: 'reputation-audit',
      title: 'Аудит репутации',
      description: 'Полный анализ площадок',
      price: 4990,
      tone: 'amber',
      icon: 'search',
    },
  ],
  payments: [
    { id: 'pay-17022026', date: '17.02.2026', title: 'Подписка Профессионал', amount: 4990, status: 'paid' },
    { id: 'pay-17012026', date: '17.01.2026', title: 'Пакет консультаций ×3', amount: 7470, status: 'paid' },
    { id: 'pay-17122025', date: '17.12.2025', title: 'Подписка Профессионал', amount: 4990, status: 'paid' },
    { id: 'pay-10122025', date: '10.12.2025', title: 'Аудит репутации', amount: 4990, status: 'refund' },
    { id: 'pay-17112025', date: '17.11.2025', title: 'Подписка Профессионал', amount: 4990, status: 'paid' },
  ],
});

export const DEFAULT_CART = Object.freeze({
  'review-pack': 2,
  'report-pack': 0,
  consultation: 0,
  'reputation-audit': 0,
});

export const PROMO_CODES = Object.freeze({
  SALE10: 10,
  SHIELD10: 10,
});
