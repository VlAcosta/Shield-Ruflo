export const DEFAULT_ADMIN_PLANS = Object.freeze([
  {
    id: 'starter',
    name: 'Стартер',
    price: 1990,
    trialDays: 14,
    replies: 10,
    reports: 3,
    consultations: 0,
    platforms: 1,
    support: 'Email поддержка',
    tone: 'cyan',
    features: ['10 ответов/мес', '3 отчёта/мес', '1 площадка', 'Email поддержка'],
  },
  {
    id: 'professional',
    name: 'Профессионал',
    price: 4990,
    trialDays: 14,
    replies: 100,
    reports: 10,
    consultations: 3,
    platforms: 5,
    support: 'Приоритетная поддержка',
    tone: 'violet',
    featured: true,
    features: ['100 ответов/мес', '10 отчётов/мес', '5 площадок', '3 консультации', 'Приоритетная поддержка'],
  },
  {
    id: 'business',
    name: 'Бизнес',
    price: 9990,
    trialDays: 14,
    replies: -1,
    reports: -1,
    consultations: 10,
    platforms: -1,
    support: 'Персональный менеджер',
    tone: 'magenta',
    features: ['Безлимит ответов', 'Безлимит отчётов', 'Все площадки', '10 консультаций', 'Персональный менеджер', 'API доступ'],
  },
]);

export const BILLING_REVENUE_SERIES = Object.freeze({
  labels: ['СЕН', 'ОКТ', 'НОЯ', 'ДЕК', 'ЯНВ', 'ФЕВ'],
  starter: [19, 21, 18, 20, 17, 16],
  professional: [20, 23, 27, 29, 31, 34],
  business: [26, 29, 32, 36, 39, 42],
});

export const UPCOMING_RENEWAL_DATES = Object.freeze({
  vnal: '20.02.2026',
  kosilov: '22.02.2026',
  megatorg: '01.03.2026',
  cleanerpro: '05.03.2026',
  medcenter: '12.03.2026',
  gorstroy: '15.03.2026',
  foodmarket: '20.03.2026',
  autopremium: '24.02.2026',
});

export const DEFAULT_BILLING_EVENTS = Object.freeze([
  { id: 'evt-1', type: 'payment', title: 'Платёж подтверждён', description: 'ООО «ВНАЛ» · Профессионал · 4 990 ₽', time: '12 мин назад', tone: 'green' },
  { id: 'evt-2', type: 'risk', title: 'Продление требует внимания', description: 'ИП Косилов А.В. · ручное продление через 14 дней', time: '38 мин назад', tone: 'orange' },
  { id: 'evt-3', type: 'upgrade', title: 'Запрошено повышение тарифа', description: 'ООО «КлинерПро» · Профессионал → Бизнес', time: '2 ч назад', tone: 'violet' },
]);

export function formatAdminMoney(value) {
  return `${Number(value || 0).toLocaleString('ru-RU')} ₽`;
}
