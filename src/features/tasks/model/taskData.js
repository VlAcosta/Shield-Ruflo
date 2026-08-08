export const TASK_STATUS = Object.freeze({
  new: { id: 'new', label: 'Новые', tone: 'violet' },
  progress: { id: 'progress', label: 'В работе', tone: 'orange' },
  waiting: { id: 'waiting', label: 'Ожидает', tone: 'purple' },
  done: { id: 'done', label: 'Готово', tone: 'green' },
});

export const TASK_STATUS_ORDER = Object.freeze(['new', 'progress', 'waiting', 'done']);

export const TASK_PRIORITIES = Object.freeze([
  { id: 'critical', label: 'Критический', tone: 'red' },
  { id: 'high', label: 'Высокий', tone: 'orange' },
  { id: 'medium', label: 'Средний', tone: 'amber' },
  { id: 'low', label: 'Низкий', tone: 'violet' },
]);

export const TASK_TYPES = Object.freeze([
  'Отзывы',
  'Площадки',
  'Контент',
  'Аналитика',
  'Стратегия',
  'Мониторинг',
  'Отчёты',
  'Обучение',
]);

export const DEFAULT_TASKS_SNAPSHOT = Object.freeze({
  version: 1,
  preferences: {
    view: 'board',
  },
  tasks: [
    {
      id: 'task-1',
      title: 'Ответить на отзывы на 2GIS',
      type: 'Отзывы',
      priority: 'critical',
      status: 'new',
      dueDate: '17.02.2026',
      description: 'Подготовить ответы на новые отзывы и согласовать формулировки для негативных обращений.',
      comments: [
        { id: 'comment-1', author: 'Мария Новикова', initials: 'МН', text: 'Нужно ответить до конца дня.', time: '09:40' },
      ],
      checklist: [
        { id: 'check-1', text: 'Проверить текст отзыва', done: true },
        { id: 'check-2', text: 'Подготовить ответ', done: false },
        { id: 'check-3', text: 'Согласовать с руководителем', done: false },
      ],
      attachments: [
        { id: 'file-1', name: 'скриншот.png', kind: 'image' },
        { id: 'file-2', name: 'данные.xlsx', kind: 'sheet' },
      ],
      createdAt: '17.02.2026',
    },
    {
      id: 'task-2',
      title: 'Обновить информацию на Яндекс',
      type: 'Площадки',
      priority: 'high',
      status: 'new',
      dueDate: '18.02.2026',
      description: 'Проверить карточку организации, актуальность контактов и часы работы.',
      comments: [
        { id: 'comment-2', author: 'Система', initials: 'БЩ', text: 'Обнаружены расхождения в двух полях.', time: '10:05' },
      ],
      checklist: [
        { id: 'check-4', text: 'Сверить контакты', done: true },
        { id: 'check-5', text: 'Обновить график работы', done: false },
      ],
      attachments: [],
      createdAt: '17.02.2026',
    },
    {
      id: 'task-3',
      title: 'Разработать шаблоны ответов',
      type: 'Контент',
      priority: 'medium',
      status: 'progress',
      dueDate: '20.02.2026',
      description: 'Подготовить набор шаблонов для позитивных, нейтральных и негативных отзывов.',
      comments: [
        { id: 'comment-3', author: 'Степан', initials: 'СЗ', text: 'Добавил примеры для спорных отзывов.', time: 'Вчера' },
      ],
      checklist: [
        { id: 'check-6', text: 'Позитивные отзывы', done: true },
        { id: 'check-7', text: 'Нейтральные отзывы', done: true },
        { id: 'check-8', text: 'Негативные отзывы', done: false },
      ],
      attachments: [],
      createdAt: '15.02.2026',
    },
    {
      id: 'task-4',
      title: 'Аудит Google My Business',
      type: 'Аналитика',
      priority: 'high',
      status: 'progress',
      dueDate: '19.02.2026',
      description: 'Проверить рейтинг, полноту карточки и динамику отзывов за последние 30 дней.',
      comments: [],
      checklist: [
        { id: 'check-9', text: 'Собрать метрики', done: true },
        { id: 'check-10', text: 'Сформировать выводы', done: false },
      ],
      attachments: [{ id: 'file-3', name: 'audit-notes.pdf', kind: 'pdf' }],
      createdAt: '16.02.2026',
    },
    {
      id: 'task-5',
      title: 'Согласовать стратегию на март',
      type: 'Стратегия',
      priority: 'medium',
      status: 'waiting',
      dueDate: '25.02.2026',
      description: 'Финализировать приоритеты по площадкам и согласовать KPI на март.',
      comments: [
        { id: 'comment-4', author: 'Лед HR', initials: 'ЛХ', text: 'Ждём финальное согласование руководителя.', time: '12:30' },
      ],
      checklist: [
        { id: 'check-11', text: 'Подготовить черновик', done: true },
        { id: 'check-12', text: 'Согласовать KPI', done: false },
      ],
      attachments: [],
      createdAt: '14.02.2026',
    },
    {
      id: 'task-6',
      title: 'Проверить упоминания в СМИ',
      type: 'Мониторинг',
      priority: 'low',
      status: 'waiting',
      dueDate: '22.02.2026',
      description: 'Проверить публикации за неделю и отметить материалы, требующие реакции.',
      comments: [],
      checklist: [],
      attachments: [],
      createdAt: '17.02.2026',
    },
    {
      id: 'task-7',
      title: 'Отчёт по итогам февраля',
      type: 'Отчёты',
      priority: 'high',
      status: 'done',
      dueDate: '17.02.2026',
      description: 'Сформировать итоговую сводку по рейтингу, отзывам и выполненным задачам.',
      comments: [
        { id: 'comment-5', author: 'Система', initials: 'БЩ', text: 'Отчёт сформирован и доступен в разделе «Отчёты».', time: '14:15' },
      ],
      checklist: [
        { id: 'check-13', text: 'Сводка по рейтингу', done: true },
        { id: 'check-14', text: 'Анализ отзывов', done: true },
        { id: 'check-15', text: 'Рекомендации', done: true },
      ],
      attachments: [{ id: 'file-4', name: 'report-february.pdf', kind: 'pdf' }],
      createdAt: '12.02.2026',
    },
    {
      id: 'task-8',
      title: 'Тренинг команды по отзывам',
      type: 'Обучение',
      priority: 'medium',
      status: 'done',
      dueDate: '15.02.2026',
      description: 'Провести внутренний тренинг по работе с негативными отзывами и эскалациями.',
      comments: [],
      checklist: [
        { id: 'check-16', text: 'Подготовить материалы', done: true },
        { id: 'check-17', text: 'Провести встречу', done: true },
      ],
      attachments: [],
      createdAt: '10.02.2026',
    },
  ],
});

export function getPriorityMeta(priority) {
  return TASK_PRIORITIES.find((item) => item.id === priority) || TASK_PRIORITIES[2];
}

export function getStatusMeta(status) {
  return TASK_STATUS[status] || TASK_STATUS.new;
}
