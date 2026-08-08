export const ADMIN_CLIENT_MANAGERS = Object.freeze([
  { id: 'alexey', name: 'Алексей Воронов', short: 'Алексей', initials: 'АВ' },
  { id: 'maria', name: 'Мария Захарова', short: 'Мария', initials: 'МЗ' },
  { id: 'dmitry', name: 'Дмитрий Козлов', short: 'Дмитрий', initials: 'ДК' },
  { id: 'svetlana', name: 'Светлана Новикова', short: 'Светлана', initials: 'СН' },
]);

export const ADMIN_CLIENT_PLANS = Object.freeze([
  { id: 'starter', label: 'Стартер', price: 1990 },
  { id: 'professional', label: 'Профессионал', price: 4990 },
  { id: 'business', label: 'Бизнес', price: 9990 },
]);

const baseClients = [
  ['kosilov', 'ИП Косилов А.В.', '7723456780', 'starter', 'active', 'maria', 1990, 4.2, '01.11.2025', '01.03.2026', 'ИП', 'Казань'],
  ['petrov', 'ИП Петров И.С.', '7789012345', 'starter', 'cancelled', 'maria', 0, 2.8, '15.11.2025', '15.12.2025', 'ИП', 'Тула'],
  ['smirnova', 'ИП Смирнова Т.П.', '7756789012', 'starter', 'expired', 'maria', 0, 3.2, '01.01.2026', '01.02.2026', 'ИП', 'Москва'],
  ['autopremium', 'ООО «АвтоПремиум»', '7745678901', 'professional', 'trial', 'alexey', 0, 3.8, '10.02.2026', '24.02.2026', 'ООО', 'Москва'],
  ['vnal', 'ООО «ВНАЛ»', '7701234567', 'professional', 'active', 'alexey', 4990, 4.99, '17.08.2025', '17.03.2026', 'ООО', 'Москва'],
  ['gorstroy', 'ООО «ГорСтрой»', '7767890123', 'business', 'active', 'dmitry', 9990, 4.5, '20.09.2025', '20.03.2026', 'ООО', 'Санкт-Петербург'],
  ['cleanerpro', 'ООО «КлинерПро»', '7778901234', 'professional', 'active', 'alexey', 4990, 4.8, '05.10.2025', '05.03.2026', 'ООО', 'Москва'],
  ['megatorg', 'ООО «МегаТорг»', '7734567890', 'business', 'active', 'dmitry', 9990, 4.7, '15.07.2025', '15.03.2026', 'ООО', 'Москва'],
  ['medcenter', 'ООО «МедЦентр»', '7701234568', 'professional', 'active', 'alexey', 4990, 4.9, '12.09.2025', '12.03.2026', 'ООО', 'Москва'],
  ['foodmarket', 'ООО «ФудМаркет»', '7790123456', 'business', 'active', 'dmitry', 9990, 4.6, '01.08.2025', '01.04.2026', 'ООО', 'Москва'],
];

const statusLabels = {
  active: 'Активен',
  trial: 'Пробный',
  expired: 'Истёк',
  cancelled: 'Отменён',
};

const managerById = Object.fromEntries(ADMIN_CLIENT_MANAGERS.map((item) => [item.id, item]));
const planById = Object.fromEntries(ADMIN_CLIENT_PLANS.map((item) => [item.id, item]));

function initialsFor(name) {
  const clean = name.replace(/[«»"']/g, '').replace(/^(ООО|ИП)\s+/u, '').trim();
  return clean.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'КЛ';
}

export const DEFAULT_ADMIN_CLIENTS = Object.freeze(baseClients.map((row, index) => {
  const [id, name, inn, planId, status, managerId, revenue, rating, startDate, expiryDate, legalForm, city] = row;
  const plan = planById[planId];
  const manager = managerById[managerId];
  const emailName = id === 'vnal' ? 'client' : id;
  return {
    id,
    name,
    inn,
    legalForm,
    city,
    industry: id === 'vnal' ? 'Торговля' : index % 3 === 0 ? 'Услуги' : index % 3 === 1 ? 'Ритейл' : 'Сервис',
    email: `${emailName}@example.ru`,
    phone: id === 'vnal' ? '+7 (999) 123-45-67' : `+7 (999) ${String(100 + index).slice(-3)}-${String(20 + index).padStart(2, '0')}-${String(30 + index).padStart(2, '0')}`,
    planId,
    plan: plan.label,
    status,
    statusLabel: statusLabels[status],
    managerId,
    manager: manager.short,
    managerName: manager.name,
    managerInitials: manager.initials,
    revenue,
    rating,
    startDate,
    expiryDate,
    autoRenew: status === 'active',
    initials: initialsFor(name),
    tasks: id === 'vnal' ? 12 : 3 + ((index * 3) % 11),
    reviews: id === 'vnal' ? 247 : 48 + index * 31,
    tickets: id === 'vnal' ? 1 : index % 4,
  };
}));

export const CLIENT_ACTIVITY = Object.freeze({
  vnal: [
    { id: 1, type: 'review', title: 'Получен новый отзыв (2GIS, ★2)', date: '17.02.2026' },
    { id: 2, type: 'task', title: 'Задача «Ответить на отзывы» выполнена', date: '16.02.2026' },
    { id: 3, type: 'report', title: 'Отчёт за февраль сформирован', date: '15.02.2026' },
    { id: 4, type: 'payment', title: 'Оплата тарифа «Профессионал»', date: '10.02.2026' },
    { id: 5, type: 'manager', title: 'Консультация с менеджером', date: '05.02.2026' },
    { id: 6, type: 'integration', title: 'Новое подключение площадки: Google Maps', date: '01.02.2026' },
  ],
});

export const CLIENT_TICKETS = Object.freeze({
  vnal: [
    { id: '1001', title: 'Не приходят уведомления на email', status: 'open', statusLabel: 'Открыт', priority: 'high' },
  ],
});

export const CLIENT_ACTIVITY_SERIES = Object.freeze({
  labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  values: [8, 13, 7, 18, 22, 5, 3],
});

export function getAdminClientMeta(client) {
  return {
    plan: planById[client.planId] || ADMIN_CLIENT_PLANS[0],
    manager: managerById[client.managerId] || ADMIN_CLIENT_MANAGERS[0],
  };
}
