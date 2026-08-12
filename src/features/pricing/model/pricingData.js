export const PRICING_PLANS = [
  {
    id: 'START',
    name: 'Start',
    eyebrow: 'Для 1 точки',
    monthlyPrice: 3490,
    description: 'Единый контроль отзывов для локального бизнеса без отдельной reputation-команды.',
    accent: 'indigo',
    cta: 'Начать 14 дней',
    outcomes: [
      'Единая очередь отзывов и уведомления',
      'Базовый response workflow и динамика рейтинга',
      'AI-помощь для быстрых черновиков',
      'QR/ссылка для сбора новых отзывов',
      'Еженедельный digest',
    ],
    limits: [
      ['Локации', 'locations.max', '1'],
      ['Источники', 'review_sources.max', '5'],
      ['Отзывы / месяц', 'reviews.monthly', '300'],
      ['Пользователи', 'users.max', '2'],
      ['AI actions / месяц', 'ai_actions.monthly', '150'],
      ['История', 'retention.months', '3 мес.'],
    ],
  },
  {
    id: 'GROWTH',
    name: 'Growth',
    eyebrow: '1–3 точки · рекомендуем',
    monthlyPrice: 8990,
    description: 'Главный outcome-пакет: SLA, аналитика причин, автоматизация и контроль повторяющихся проблем.',
    accent: 'violet',
    popular: true,
    cta: 'Выбрать Growth',
    outcomes: [
      'Sentiment и классификация причин негатива',
      'SLA timers, risk и overdue states',
      'Negative review → task, до 10 правил',
      'Custom tone of voice',
      'До 3 конкурентов и периодические отчёты',
      'Priority email/in-app support',
    ],
    limits: [
      ['Локации', 'locations.max', '3'],
      ['Источники', 'review_sources.max', '10'],
      ['Отзывы / месяц', 'reviews.monthly', '1 500'],
      ['Пользователи', 'users.max', '5'],
      ['AI actions / месяц', 'ai_actions.monthly', '1 500'],
      ['История', 'retention.months', '12 мес.'],
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    eyebrow: 'Сети 4–10 точек',
    monthlyPrice: 18990,
    description: 'Governance для команд и сетей: approval, расширенный RBAC, интеграции и сравнение локаций.',
    accent: 'pink',
    cta: 'Выбрать Pro',
    outcomes: [
      'Draft → approval → publish workflow',
      'Расширенный RBAC и история ключевых действий',
      'Legal escalation queue / case workflow',
      'До 50 automation rules и task routing',
      'До 10 конкурентов и custom reports',
      'API/webhooks для production-ready сценариев',
    ],
    limits: [
      ['Локации', 'locations.max', '10'],
      ['Источники', 'review_sources.max', '15'],
      ['Отзывы / месяц', 'reviews.monthly', '5 000'],
      ['Пользователи', 'users.max', '15'],
      ['AI actions / месяц', 'ai_actions.monthly', '6 000'],
      ['История', 'retention.months', '24 мес.'],
    ],
  },
  {
    id: 'BUSINESS',
    name: 'Business',
    eyebrow: '10–25+ точек · enterprise/agency',
    monthlyPrice: 39900,
    pricePrefix: 'от',
    description: 'Multi-location и agency-контур с расширенным governance, API, audit и индивидуальными условиями.',
    accent: 'indigo',
    cta: 'Обсудить условия',
    contactSales: true,
    outcomes: [
      'Advanced RBAC, audit export и scoped access',
      'Agency / multi-organization workflows',
      'API/webhooks и custom connector scope',
      'Provider sync observability и contractual support SLA',
      'Dedicated customer success / QBR',
      'Custom retention, volume и security terms',
    ],
    limits: [
      ['Локации', 'locations.max', '25 базово'],
      ['Источники', 'review_sources.max', '50 базово'],
      ['Отзывы / месяц', 'reviews.monthly', '20 000 базово'],
      ['Пользователи', 'users.max', '50 базово'],
      ['AI actions / месяц', 'ai_actions.monthly', '20 000 базово'],
      ['История', 'retention.months', '36+ мес.'],
    ],
  },
];

export const SOFTWARE_ADDONS = [
  { id: 'location-growth', title: 'Доп. location', price: 900, note: 'Growth · +900 ₽/мес; Pro · +700 ₽/мес' },
  { id: 'review-pack', title: '+1 000 reviews/events', price: 690, note: 'Сезонный объём без вынужденной смены тарифа' },
  { id: 'ai-pack', title: '+1 000 AI actions', price: 490, note: 'Прозрачный fair-use для генераций и classification' },
  { id: 'competitor-pack', title: 'Competitor Pack +5', price: 990, note: 'Ещё 5 объектов мониторинга' },
  { id: 'additional-user', title: 'Additional user', price: 490, note: 'Growth +490 ₽; Pro +390 ₽ / месяц' },
  { id: 'retention-pack', title: 'Extended retention +12 мес.', price: 1490, note: 'Для аудита и сезонных сравнений' },
];

export const MANAGED_SERVICES = [
  { id: 'reply-lite', title: 'Shield Reply Lite', price: 14900, suffix: '/мес', description: 'До 200 подготовленных/отработанных ответов, tone of voice и business-hours SLA.' },
  { id: 'reply-pro', title: 'Shield Reply Pro', price: 29900, suffix: '/мес', description: 'До 600 ответов, приоритизация негатива, root-cause summary и расширенный SLA.' },
  { id: 'legal', title: 'Legal review retainer', price: 9900, prefix: 'от', suffix: '/мес', description: 'Пакет первичных юридических разборов; сложные кейсы считаются отдельно.' },
  { id: 'content', title: 'Design / Content credits', price: 12900, prefix: 'от', suffix: '/мес', description: 'Credits / часы / deliverables вместо безлимитных «задач в неделю».' },
  { id: 'strategy', title: 'Reputation strategy / CSM+', price: 19900, prefix: 'от', suffix: '/мес', description: 'Ежемесячная стратегия, QBR, root-cause review и action plan.' },
  { id: 'crisis', title: 'Crisis Response', price: 49900, prefix: 'от', suffix: 'за incident', description: 'Отдельный project scope с часовыми лимитами и emergency SLA.' },
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

export function mergeServerCatalog(plans = PRICING_PLANS, serverPlans = []) {
  const byCode = new Map((Array.isArray(serverPlans) ? serverPlans : []).map((plan) => [String(plan.code || plan.id || '').toUpperCase(), plan]));
  return plans.map((plan) => {
    const server = byCode.get(plan.id);
    if (!server) return plan;
    const entitlements = server.entitlements || {};
    const limits = plan.limits.map(([label, key, fallback]) => {
      const raw = entitlements[key];
      if (raw === undefined || raw === null) return [label, key, fallback];
      const suffix = key === 'retention.months' ? ' мес.' : '';
      const formatted = typeof raw === 'number' ? `${raw.toLocaleString('ru-RU')}${suffix}` : String(raw);
      return [label, key, formatted];
    });
    return {
      ...plan,
      monthlyPrice: typeof server.priceCents === 'number' ? server.priceCents / 100 : plan.monthlyPrice,
      serverPlan: server,
      limits,
    };
  });
}
