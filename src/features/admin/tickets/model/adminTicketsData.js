export const ADMIN_TICKET_STATUS = Object.freeze({
  open: { id: 'open', label: 'Открыт', tone: 'red' },
  in_progress: { id: 'in_progress', label: 'В обработке', tone: 'orange' },
  waiting: { id: 'waiting', label: 'Ждём клиента', tone: 'violet' },
  closed: { id: 'closed', label: 'Закрыт', tone: 'green' },
});

export const ADMIN_TICKET_PRIORITY = Object.freeze({
  high: { id: 'high', label: 'Высокий', tone: 'red', weight: 3 },
  medium: { id: 'medium', label: 'Средний', tone: 'orange', weight: 2 },
  low: { id: 'low', label: 'Обычный', tone: 'neutral', weight: 1 },
});

const m = (id, author, role, text, createdAt, extra = {}) => ({
  id,
  author,
  role,
  text,
  createdAt,
  ...extra,
});

export const DEFAULT_ADMIN_TICKETS = Object.freeze([
  {
    id: '1001',
    subject: 'Не приходят уведомления на email',
    clientId: 'vnal',
    clientName: 'ООО «ВНАЛ»',
    clientInitials: 'ВН',
    status: 'open',
    priority: 'high',
    category: 'Уведомления',
    channel: 'Техническая поддержка',
    assignedManagerId: 'alexey',
    assignedManagerName: 'Алексей Воронов',
    createdAt: '17.02.2026 10:18',
    updatedAt: '17.02.2026 11:26',
    firstResponseMinutes: 8,
    slaMinutes: 30,
    unread: 2,
    messages: [
      m('1001-1', 'Клиент', 'client', 'Добрый день! У нас возникла проблема: не приходят уведомления на email. Можете помочь разобраться?', '17.02.2026 10:18'),
      m('1001-2', 'Алексей', 'agent', 'Добрый день! Проверяю настройки доставки. Уточните, пожалуйста, на какой адрес должны приходить уведомления и когда вы заметили проблему?', '17.02.2026 10:26'),
      m('1001-3', 'Клиент', 'client', 'client@vnal.ru. Последнее письмо было вчера вечером, сегодня уже ничего не приходит.', '17.02.2026 11:26'),
    ],
    activity: [
      { id: 'a1', label: 'Тикет создан', at: '17.02.2026 10:18' },
      { id: 'a2', label: 'Назначен Алексей Воронов', at: '17.02.2026 10:20' },
      { id: 'a3', label: 'Первый ответ отправлен', at: '17.02.2026 10:26' },
    ],
  },
  {
    id: '1002', subject: 'Ошибка при формировании отчёта', clientId: 'megatorg', clientName: 'ООО «МегаТорг»', clientInitials: 'Ме',
    status: 'in_progress', priority: 'high', category: 'Отчёты', channel: 'Техническая поддержка', assignedManagerId: 'maria', assignedManagerName: 'Мария Захарова',
    createdAt: '16.02.2026 16:42', updatedAt: '17.02.2026 09:10', firstResponseMinutes: 14, slaMinutes: 30, unread: 0,
    messages: [m('1002-1','Клиент','client','При попытке сформировать отчёт за январь появляется ошибка.','16.02.2026 16:42'), m('1002-2','Мария','agent','Спасибо, передала логи в техническую команду. Уже разбираемся.','16.02.2026 16:56')],
    activity: [{ id:'a1',label:'Тикет создан',at:'16.02.2026 16:42'},{id:'a2',label:'Статус изменён на «В обработке»',at:'16.02.2026 17:02'}],
  },
  {
    id: '1003', subject: 'Как настроить Telegram-уведомления?', clientId: 'kosilov', clientName: 'ИП Косилов А.В.', clientInitials: 'ИП',
    status: 'open', priority: 'medium', category: 'Интеграции', channel: 'Менеджер', assignedManagerId: 'maria', assignedManagerName: 'Мария Захарова',
    createdAt: '14.02.2026 12:04', updatedAt: '16.02.2026 17:20', firstResponseMinutes: 21, slaMinutes: 60, unread: 1,
    messages: [m('1003-1','Клиент','client','Подскажите, где подключается Telegram и можно ли выбрать типы уведомлений?','14.02.2026 12:04')], activity: [{id:'a1',label:'Тикет создан',at:'14.02.2026 12:04'}],
  },
  {
    id: '1004', subject: 'Задачи не синхронизируются', clientId: 'foodmarket', clientName: 'ООО «ФудМаркет»', clientInitials: 'Фу',
    status: 'open', priority: 'high', category: 'Задачи', channel: 'Техническая поддержка', assignedManagerId: 'dmitry', assignedManagerName: 'Дмитрий Козлов',
    createdAt: '15.02.2026 09:36', updatedAt: '17.02.2026 10:55', firstResponseMinutes: 6, slaMinutes: 30, unread: 3,
    messages: [m('1004-1','Клиент','client','После обновления задачи перестали синхронизироваться между сотрудниками.','15.02.2026 09:36'),m('1004-2','Дмитрий','agent','Проверяю очередь синхронизации. Пришлите, пожалуйста, пример ID задачи.','15.02.2026 09:42')], activity:[{id:'a1',label:'Тикет создан',at:'15.02.2026 09:36'}],
  },
  {
    id: '1005', subject: 'PIN-код не работает', clientId: 'cleanerpro', clientName: 'ООО «КлинерПро»', clientInitials: 'Кл',
    status: 'in_progress', priority: 'medium', category: 'Безопасность', channel: 'Техническая поддержка', assignedManagerId: 'alexey', assignedManagerName: 'Алексей Воронов',
    createdAt: '13.02.2026 18:17', updatedAt: '17.02.2026 08:38', firstResponseMinutes: 4, slaMinutes: 30, unread: 0,
    messages:[m('1005-1','Клиент','client','После смены PIN система пишет, что код неверный.','13.02.2026 18:17'),m('1005-2','Алексей','agent','Проверяю журнал безопасности и состояние блокировки.','13.02.2026 18:21')], activity:[{id:'a1',label:'Тикет создан',at:'13.02.2026 18:17'}],
  },
  {
    id: '1006', subject: 'Вопрос по тарифам', clientId: 'gorstroy', clientName: 'ООО «ГорСтрой»', clientInitials: 'Го',
    status: 'closed', priority: 'low', category: 'Подписка', channel: 'Менеджер', assignedManagerId: 'dmitry', assignedManagerName: 'Дмитрий Козлов',
    createdAt: '11.02.2026 11:08', updatedAt: '12.02.2026 14:20', firstResponseMinutes: 12, slaMinutes: 120, unread: 0,
    messages:[m('1006-1','Клиент','client','Чем тариф Бизнес отличается от Профессионального?','11.02.2026 11:08'),m('1006-2','Дмитрий','agent','Отправил сравнение лимитов и возможностей API. Если понадобится, помогу с переходом.','11.02.2026 11:20')], activity:[{id:'a1',label:'Тикет закрыт',at:'12.02.2026 14:20'}],
  },
  {
    id: '1007', subject: 'Нет доступа к отчётам', clientId: 'medcenter', clientName: 'ООО «МедЦентр»', clientInitials: 'Ме',
    status: 'closed', priority: 'medium', category: 'Доступ', channel: 'Техническая поддержка', assignedManagerId: 'alexey', assignedManagerName: 'Алексей Воронов',
    createdAt: '09.02.2026 08:55', updatedAt: '10.02.2026 13:40', firstResponseMinutes: 7, slaMinutes: 60, unread: 0,
    messages:[m('1007-1','Клиент','client','У одного сотрудника пропал раздел отчётов.','09.02.2026 08:55'),m('1007-2','Алексей','agent','Права восстановлены. Проверьте доступ после повторного входа.','09.02.2026 09:02')], activity:[{id:'a1',label:'Тикет закрыт',at:'10.02.2026 13:40'}],
  },
]);

export const TICKET_STATUS_OPTIONS = Object.values(ADMIN_TICKET_STATUS);
export const TICKET_PRIORITY_OPTIONS = Object.values(ADMIN_TICKET_PRIORITY);

export function getStatusMeta(status) {
  return ADMIN_TICKET_STATUS[status] || ADMIN_TICKET_STATUS.open;
}

export function getPriorityMeta(priority) {
  return ADMIN_TICKET_PRIORITY[priority] || ADMIN_TICKET_PRIORITY.low;
}
