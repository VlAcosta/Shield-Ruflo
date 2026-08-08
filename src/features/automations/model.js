export const AUTOMATION_TRIGGERS = Object.freeze([
  { id: 'review.received', label: 'Получен новый отзыв', description: 'Срабатывает один раз для каждого нового отзыва.' },
  { id: 'review.sla_at_risk', label: 'SLA близок к нарушению', description: 'Когда использовано 75% допустимого времени ответа.' },
  { id: 'review.sla_breached', label: 'SLA нарушен', description: 'Когда время ответа вышло.' },
  { id: 'review.approval_waiting', label: 'Ответ ждёт согласования', description: 'Черновик находится на согласовании более 4 часов.' },
  { id: 'reputation.reason_spike', label: 'Резкий рост причины негатива', description: 'Причина жалоб выросла минимум на 50% к прошлому периоду.' },
]);

export const AUTOMATION_ACTIONS = Object.freeze([
  { id: 'create_task', label: 'Создать задачу', description: 'Добавить связанную задачу в рабочий контур.' },
  { id: 'notify', label: 'Уведомить руководителя', description: 'Добавить событие в центр уведомлений.' },
  { id: 'send_for_approval', label: 'Отправить на согласование', description: 'Перевести подготовленный ответ руководителю.' },
  { id: 'assign_shield', label: 'Передать Бизнес Щит', description: 'Назначить отзыв команде Бизнес Щит.' },
]);

export const AUTOMATION_TEMPLATES = Object.freeze([
  {
    id: 'negative-review', name: 'Негатив → срочная задача', description: 'Каждый отзыв 1–3★ превращается в контролируемую задачу и уведомление.', enabled: true,
    trigger: 'review.received', conditions: { ratingMin: 1, ratingMax: 3, platforms: [], reasons: [] }, actions: ['create_task', 'notify'], priority: 'high',
  },
  {
    id: 'sla-risk', name: 'Предупреждение до нарушения SLA', description: 'Сообщить руководителю, когда использовано 75% времени реакции.', enabled: true,
    trigger: 'review.sla_at_risk', conditions: { ratingMin: 1, ratingMax: 5, platforms: [], reasons: [] }, actions: ['notify'], priority: 'high',
  },
  {
    id: 'sla-breach', name: 'Просроченный SLA → эскалация', description: 'Создать критическую задачу и уведомить руководителя о просрочке.', enabled: true,
    trigger: 'review.sla_breached', conditions: { ratingMin: 1, ratingMax: 5, platforms: [], reasons: [] }, actions: ['create_task', 'notify'], priority: 'critical',
  },
  {
    id: 'approval-waiting', name: 'Согласование без ответа', description: 'Напомнить руководителю, если черновик ждёт решения больше 4 часов.', enabled: true,
    trigger: 'review.approval_waiting', conditions: { ratingMin: 1, ratingMax: 5, platforms: [], reasons: [] }, actions: ['notify'], priority: 'medium',
  },
  {
    id: 'reason-spike', name: 'Всплеск причины → расследование', description: 'Создать задачу на поиск первопричины при росте категории негатива.', enabled: false,
    trigger: 'reputation.reason_spike', conditions: { ratingMin: 1, ratingMax: 3, platforms: [], reasons: [] }, actions: ['create_task', 'notify'], priority: 'high',
  },
]);
