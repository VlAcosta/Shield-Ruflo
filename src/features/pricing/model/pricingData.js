export const PRICING_PLANS = [
  {
    id: 'basic',
    name: 'Базовый',
    eyebrow: 'Для небольших команд',
    monthlyPrice: 2500,
    description: 'Мониторинг, быстрые уведомления и базовые инструменты репутации без лишней сложности.',
    accent: 'indigo',
    features: [
      'Мониторинг площадок 24/7',
      'Уведомления о новых отзывах',
      'Ответы на негатив из кабинета',
      'Базовая аналитика и динамика рейтинга',
      'До 3 дизайн-задач в неделю',
      'Мобильный доступ к кабинету',
    ],
  },
  {
    id: 'pro',
    name: 'Продвинутый',
    eyebrow: 'Оптимальный выбор',
    monthlyPrice: 8500,
    description: 'Для бизнеса, которому важны рост рейтинга, конкуренты, регулярные отчёты и контент.',
    accent: 'violet',
    popular: true,
    features: [
      'Всё из Базового тарифа',
      'Расширенная аналитика',
      'Досье на конкурентов',
      'Стратегия роста репутации',
      'Отчёты каждую пятницу',
      'QR и продвинутые сценарии',
      'Контент-поддержка',
      'База знаний и чек-листы',
    ],
  },
  {
    id: 'ultimate',
    name: 'Ультимативный',
    eyebrow: 'Максимум возможностей',
    monthlyPrice: 44000,
    description: 'Полное сопровождение репутации, бренда и коммуникаций командой специалистов.',
    accent: 'pink',
    features: [
      'Все возможности без лимитов',
      'Команда специалистов по задачам',
      'Дизайн и контент-сопровождение',
      'Работа со СМИ и личным брендом',
      'Персональный менеджер',
      'Юридическое сопровождение',
      'Антикризисные сценарии',
      'Приоритетный SLA',
    ],
  },
];

export const BUILDER_OPTIONS = [
  ['reviews', 'Мониторинг и уведомления', 1200],
  ['analytics', 'Продвинутая аналитика', 1900],
  ['competitors', 'Мониторинг конкурентов', 1600],
  ['reports', 'Еженедельные отчёты', 1400],
  ['design', 'Дизайн-поддержка', 3500],
  ['content', 'Контент-поддержка', 4200],
  ['automation', 'Автоматизация процессов', 2500],
  ['legal', 'Юридическое сопровождение', 6900],
  ['manager', 'Персональный менеджер', 7500],
];

export const BILLING_PERIODS = {
  monthly: { id: 'monthly', label: 'Ежемесячно', months: 1, discount: 0 },
  annual: { id: 'annual', label: 'За год', months: 12, discount: 0.15 },
};

export const formatPrice = (value) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

export const calculatePlanTotal = (plan, billingId = 'monthly', promoDiscount = 0) => {
  const billing = BILLING_PERIODS[billingId] || BILLING_PERIODS.monthly;
  const subtotal = plan.monthlyPrice * billing.months;
  const billingDiscount = subtotal * billing.discount;
  const afterBilling = subtotal - billingDiscount;
  const promoValue = afterBilling * promoDiscount;
  const total = Math.max(0, afterBilling - promoValue);

  return { subtotal, billingDiscount, promoValue, total, billing };
};
