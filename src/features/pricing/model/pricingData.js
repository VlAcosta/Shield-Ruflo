export const PRICING_PLANS = [
  {
    id: 'START',
    name: 'Start',
    eyebrow: 'Для 1 точки',
    monthlyPrice: 3490,
    description: 'Отзывы и рейтинг под контролем для локального бизнеса без отдельного специалиста по репутации.',
    accent: 'indigo',
    cta: 'Начать 14 дней',
    outcomes: [
      'Единая очередь отзывов и уведомления',
      'Работа с отзывами и динамика рейтинга',
      'Помощь ИИ для быстрых черновиков',
      'QR/ссылка для сбора новых отзывов',
      'Еженедельный отчёт',
    ],
    limits: [
      ['Локации', 'locations.max', '1'],
      ['Источники', 'review_sources.max', '5'],
      ['Отзывы / месяц', 'reviews.monthly', '300'],
      ['Пользователи', 'users.max', '2'],
      ['Действия ИИ / месяц', 'ai_actions.monthly', '150'],
      ['История', 'retention.months', '3 мес.'],
    ],
  },
  {
    id: 'GROWTH',
    name: 'Growth',
    eyebrow: '1–3 точки · рекомендуем',
    monthlyPrice: 8990,
    description: 'Для растущего бизнеса: контроль сроков, анализ причин жалоб, автоматизация и работа с повторяющимися проблемами.',
    accent: 'violet',
    popular: true,
    cta: 'Выбрать Growth',
    outcomes: [
      'Определение настроения и причин негативных отзывов',
      'Контроль сроков и просроченных ответов',
      'Автоматические задачи по негативным отзывам, до 10 правил',
      'Фирменный стиль ответов',
      'До 3 конкурентов и периодические отчёты',
      'Приоритетная поддержка по email и в кабинете',
    ],
    limits: [
      ['Локации', 'locations.max', '3'],
      ['Источники', 'review_sources.max', '10'],
      ['Отзывы / месяц', 'reviews.monthly', '1 500'],
      ['Пользователи', 'users.max', '5'],
      ['Действия ИИ / месяц', 'ai_actions.monthly', '1 500'],
      ['История', 'retention.months', '12 мес.'],
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    eyebrow: 'Сети 4–10 точек',
    monthlyPrice: 18990,
    description: 'Для команд и сетей: согласование ответов, расширенные роли сотрудников, интеграции и сравнение филиалов.',
    accent: 'pink',
    cta: 'Выбрать Pro',
    outcomes: [
      'Черновик → согласование → публикация',
      'Расширенные роли сотрудников и история ключевых действий',
      'Отдельная работа со сложными и юридическими случаями',
      'До 50 правил автоматизации и распределение задач',
      'До 10 конкурентов и настраиваемые отчёты',
      'API и вебхуки для интеграции с другими системами',
    ],
    limits: [
      ['Локации', 'locations.max', '10'],
      ['Источники', 'review_sources.max', '15'],
      ['Отзывы / месяц', 'reviews.monthly', '5 000'],
      ['Пользователи', 'users.max', '15'],
      ['Действия ИИ / месяц', 'ai_actions.monthly', '6 000'],
      ['История', 'retention.months', '24 мес.'],
    ],
  },
  {
    id: 'BUSINESS',
    name: 'Business',
    eyebrow: 'От 10 точек · крупные сети и агентства',
    monthlyPrice: 39900,
    pricePrefix: 'от',
    description: 'Для крупных сетей и агентств: работа с несколькими организациями, расширенные права, интеграции и индивидуальные условия.',
    accent: 'indigo',
    cta: 'Обсудить условия',
    contactSales: true,
    outcomes: [
      'Гибкие роли сотрудников, выгрузка истории действий и разграничение доступа',
      'Работа агентства с несколькими организациями',
      'API, вебхуки и индивидуальные подключения',
      'Контроль синхронизации источников и согласованные сроки поддержки',
      'Персональное сопровождение и регулярные встречи по результатам',
      'Индивидуальные объёмы, сроки хранения данных и требования безопасности',
    ],
    limits: [
      ['Локации', 'locations.max', '25 базово'],
      ['Источники', 'review_sources.max', '50 базово'],
      ['Отзывы / месяц', 'reviews.monthly', '20 000 базово'],
      ['Пользователи', 'users.max', '50 базово'],
      ['Действия ИИ / месяц', 'ai_actions.monthly', '20 000 базово'],
      ['История', 'retention.months', '36+ мес.'],
    ],
  },
];

export const SOFTWARE_ADDONS = [
  { id: 'location-growth', title: 'Дополнительная точка', price: 900, note: 'Growth · +900 ₽/мес; Pro · +700 ₽/мес' },
  { id: 'review-pack', title: '+1 000 отзывов', price: 690, note: 'Сезонный объём без вынужденной смены тарифа' },
  { id: 'ai-pack', title: '+1 000 AI actions', price: 490, note: 'Дополнительный объём для генерации и анализа' },
  { id: 'competitor-pack', title: 'Ещё 5 конкурентов', price: 990, note: 'Ещё 5 объектов мониторинга' },
  { id: 'additional-user', title: 'Дополнительный пользователь', price: 490, note: 'Growth +490 ₽; Pro +390 ₽ / месяц' },
  { id: 'retention-pack', title: 'Хранение данных +12 мес.', price: 1490, note: 'Для аудита и сезонных сравнений' },
];

export const MANAGED_SERVICES = [
  { id: 'reply-lite', title: 'Shield Reply Lite', price: 14900, suffix: '/мес', description: 'До 200 подготовленных ответов, фирменный стиль общения и работа в согласованные часы.' },
  { id: 'reply-pro', title: 'Shield Reply Pro', price: 29900, suffix: '/мес', description: 'До 600 ответов, приоритизация негатива, краткий анализ причин и расширенные сроки поддержки.' },
  { id: 'legal', title: 'Юридическая проверка', price: 9900, prefix: 'от', suffix: '/мес', description: 'Пакет первичных юридических разборов; сложные кейсы считаются отдельно.' },
  { id: 'content', title: 'Дизайн и контент', price: 12900, prefix: 'от', suffix: '/мес', description: 'Оплата за согласованный объём работ или часы — без обещаний «безлимитных задач».' },
  { id: 'strategy', title: 'Стратегия репутации и сопровождение', price: 19900, prefix: 'от', suffix: '/мес', description: 'Ежемесячный разбор результатов, причин проблем и план действий.' },
  { id: 'crisis', title: 'Антикризисная поддержка', price: 49900, prefix: 'от', suffix: 'за случай', description: 'Отдельный объём работ с часовыми лимитами и приоритетной поддержкой.' },
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
