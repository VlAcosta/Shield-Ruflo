export const REPORT_TABS = Object.freeze([
  { id: 'list', label: 'Список отчётов' },
  { id: 'builder', label: 'Конструктор' },
  { id: 'schedule', label: 'Расписание' },
]);

export const DEFAULT_REPORTS_SNAPSHOT = Object.freeze({
  reports: [
    {
      id: 'rep-feb-2026',
      title: 'Отчёт по репутации — февраль 2026',
      period: 'Февраль 2026',
      date: '17.02.2026',
      size: '2.4 МБ',
      status: 'ready',
      type: 'Репутация',
      description: 'Сводный отчёт по отзывам, рейтингу, площадкам и выполненным задачам.',
      metrics: [
        { id: 'rating', label: 'Общий рейтинг', value: '4.99', delta: '+0.12 за период', tone: 'violet' },
        { id: 'reviews', label: 'Отзывов получено', value: '247', delta: '+18% к прошлому', tone: 'cyan' },
        { id: 'answers', label: 'Ответов дано', value: '198', delta: '80.2% из всех', tone: 'green' },
        { id: 'tasks', label: 'Задач выполнено', value: '34/40', delta: '85% выполнение', tone: 'orange' },
      ],
      sections: [
        { id: 'platforms', title: 'Анализ отзывов по площадкам', subtitle: 'Данные за Февраль 2026', kind: 'bars' },
        { id: 'rating-dynamics', title: 'Динамика рейтинга', subtitle: 'Данные за Февраль 2026', kind: 'line' },
        { id: 'tasks', title: 'Ключевые задачи', subtitle: 'Данные за Февраль 2026', kind: 'tasks' },
        { id: 'recommendations', title: 'Рекомендации', subtitle: 'Данные за Февраль 2026', kind: 'recommendations' },
      ],
    },
    {
      id: 'rep-jan-2026',
      title: 'Отчёт по репутации — январь 2026',
      period: 'Январь 2026',
      date: '17.01.2026',
      size: '2.1 МБ',
      status: 'ready',
      type: 'Репутация',
    },
    {
      id: 'rep-q4-2025',
      title: 'Анализ конкурентов Q4 2025',
      period: 'Q4 2025',
      date: '31.12.2025',
      size: '3.7 МБ',
      status: 'ready',
      type: 'Конкуренты',
    },
    {
      id: 'rep-dec-2025',
      title: 'Отчёт по репутации — декабрь 2025',
      period: 'Декабрь 2025',
      date: '17.12.2025',
      size: '2.0 МБ',
      status: 'ready',
      type: 'Репутация',
    },
    {
      id: 'rep-nov-2025',
      title: 'Отчёт — ноябрь 2025',
      period: 'Ноябрь 2025',
      date: '17.11.2025',
      size: '—',
      status: 'processing',
      type: 'Сводный',
    },
    {
      id: 'rep-oct-2025',
      title: 'Аудит площадок — октябрь 2025',
      period: 'Октябрь 2025',
      date: '17.10.2025',
      size: '4.2 МБ',
      status: 'ready',
      type: 'Площадки',
    },
  ],
  schedules: [
    { id: 'weekly', title: 'Еженедельный отчёт', day: 'mon', dayLabel: 'Пн', time: '09:00', channel: 'email', channelLabel: 'Email', enabled: true },
    { id: 'competitors', title: 'Конкурентный анализ', day: 'fri', dayLabel: 'Пт', time: '18:00', channel: 'telegram', channelLabel: 'Telegram', enabled: true },
    { id: 'monthly', title: 'Сводка за месяц', day: 'month-start', dayLabel: '1-е число', time: '10:00', channel: 'email', channelLabel: 'Email', enabled: false },
  ],
});

export const BUILDER_PERIODS = Object.freeze([
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'custom', label: 'Свой' },
]);

export const BUILDER_BLOCKS = Object.freeze([
  { id: 'rating', label: 'Сводка по рейтингу', description: 'Средний рейтинг и изменение за период', enabled: true, tone: 'violet' },
  { id: 'reviews', label: 'Анализ отзывов', description: 'Количество, тональность и источники', enabled: true, tone: 'cyan' },
  { id: 'reputation', label: 'Динамика репутации', description: 'Изменение ключевых показателей', enabled: true, tone: 'purple' },
  { id: 'platforms', label: 'Площадки', description: 'Сравнение площадок и каналов', enabled: true, tone: 'blue' },
  { id: 'competitors', label: 'Анализ конкурентов', description: 'Сравнение с выбранными конкурентами', enabled: false, tone: 'orange' },
  { id: 'tasks', label: 'Выполненные задачи', description: 'Результаты по задачам и процессам', enabled: true, tone: 'green' },
  { id: 'recommendations', label: 'Рекомендации', description: 'Автоматические рекомендации системы', enabled: false, tone: 'pink' },
]);

export const WEEK_DAYS = Object.freeze([
  { id: 'mon', label: 'Пн' },
  { id: 'tue', label: 'Вт' },
  { id: 'wed', label: 'Ср' },
  { id: 'thu', label: 'Чт' },
  { id: 'fri', label: 'Пт' },
  { id: 'sat', label: 'Сб' },
  { id: 'sun', label: 'Вс' },
]);

export const DELIVERY_CHANNELS = Object.freeze([
  { id: 'email', label: 'Email' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'whatsapp', label: 'WhatsApp' },
]);
