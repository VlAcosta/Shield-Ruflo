export const ADMIN_DASHBOARD_FALLBACK = Object.freeze({
  metrics: [
    { id: 'revenue', label: 'Выручка / мес.', value: '847 500 ₽', delta: '+3.2%', tone: 'violet', direction: 'up' },
    { id: 'clients', label: 'Активных клиентов', value: '127', delta: '+3 за мес.', tone: 'purple', direction: 'up' },
    { id: 'churn', label: 'Отток (Churn)', value: '3.2%', delta: '-0.5%', tone: 'green', direction: 'down' },
    { id: 'tickets', label: 'Открытых тикетов', value: '18', delta: '+5 за неделю', tone: 'red', direction: 'up' },
    { id: 'newClients', label: 'Новых за мес.', value: '12', delta: '+2 vs прошлый', tone: 'orange', direction: 'up' },
    { id: 'renewals', label: 'Renewals rate', value: '94%', delta: '+1.2%', tone: 'blue', direction: 'up' },
  ],
  revenue: {
    months: ['СЕН', 'ОКТ', 'НОЯ', 'ДЕК', 'ЯНВ', 'ФЕВ'],
    values: [650, 720, 748, 815, 836, 848],
  },
  tariffs: [
    { id: 'professional', label: 'Профессионал', count: 4, tone: '#5f62ed' },
    { id: 'business', label: 'Бизнес', count: 3, tone: '#ad48ea' },
    { id: 'starter', label: 'Стартер', count: 3, tone: '#17b985' },
  ],
  clients: [
    { id: 'vnal', initials: 'ВН', name: 'ООО «ВНАЛ»', meta: 'Профессионал · Алексей', revenue: '4 990 ₽', status: 'Активен', tone: 'violet' },
    { id: 'kosilov', initials: 'ИП', name: 'ИП Косилов А.В.', meta: 'Стартер · Мария', revenue: '1 990 ₽', status: 'Активен', tone: 'purple' },
    { id: 'megatorg', initials: 'Ме', name: 'ООО «МегаТорг»', meta: 'Бизнес · Дмитрий', revenue: '9 990 ₽', status: 'Активен', tone: 'violet' },
    { id: 'autopremium', initials: 'Ав', name: 'ООО «АвтоПремиум»', meta: 'Профессионал · Алексей', revenue: '0 ₽', status: 'Пробный', tone: 'purple' },
    { id: 'smirnova', initials: 'ИП', name: 'ИП Смирнова Т.П.', meta: 'Стартер · Мария', revenue: '0 ₽', status: 'Истёк', tone: 'violet' },
  ],
  tickets: [
    { id: '#1001', title: 'Не приходят уведомления на email', company: 'ООО «ВНАЛ»', status: 'Открыт', tone: 'red' },
    { id: '#1002', title: 'Ошибка при формировании отчёта', company: 'ООО «МегаТорг»', status: 'В обработке', tone: 'orange' },
    { id: '#1003', title: 'Как настроить Telegram-уведомления?', company: 'ИП Косилов А.В.', status: 'Открыт', tone: 'violet' },
    { id: '#1004', title: 'Задачи не синхронизируются', company: 'ООО «ФудМаркет»', status: 'Открыт', tone: 'red' },
  ],
  managers: [
    { id: 'alexey', initials: 'АВ', name: 'Алексей', clients: 4, rating: 4.8, revenue: 250000, tone: 'violet' },
    { id: 'maria', initials: 'МЗ', name: 'Мария', clients: 3, rating: 4.6, revenue: 50000, tone: 'purple' },
    { id: 'dmitry', initials: 'ДК', name: 'Дмитрий', clients: 3, rating: 4.9, revenue: 500000, tone: 'green' },
  ],
});

export const ADMIN_DASHBOARD_SEARCH = Object.freeze([
  { id: 'admin-revenue', title: 'Выручка', description: 'Динамика выручки за 6 месяцев', keywords: 'mrr деньги график доход' },
  { id: 'admin-tariffs', title: 'Тарифы', description: 'Распределение клиентов по тарифам', keywords: 'стартер профессионал бизнес' },
  { id: 'admin-clients', title: 'Последние клиенты', description: 'Недавние клиенты и статусы', keywords: 'клиенты компании организации' },
  { id: 'admin-tickets', title: 'Открытые тикеты', description: 'Текущие обращения поддержки', keywords: 'тикеты поддержка проблемы' },
  { id: 'admin-managers', title: 'Менеджеры', description: 'Команда и рейтинг', keywords: 'команда сотрудники менеджеры' },
  { id: 'admin-manager-revenue', title: 'Выручка по менеджерам', description: 'Вклад менеджеров в выручку', keywords: 'менеджеры доход выручка' },
]);
