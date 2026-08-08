export const NOTIFICATION_TABS = Object.freeze([
  { id: 'unread', label: 'Непрочитанные' },
  { id: 'all', label: 'Все' },
  { id: 'settings', label: 'Настройки' },
]);

export const NOTIFICATION_TYPES = Object.freeze([
  { id: 'all', label: 'Все типы' },
  { id: 'reviews', label: 'Отзывы' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'reports', label: 'Отчёты' },
  { id: 'chat', label: 'Чат' },
  { id: 'system', label: 'Система' },
]);

export const CHANNELS = Object.freeze([
  { id: 'email', label: 'Email', description: 'Отправка на указанный email' },
  { id: 'telegram', label: 'Telegram', description: 'Уведомления в Telegram-бот' },
  { id: 'push', label: 'Push', description: 'Уведомления в браузере' },
  { id: 'sms', label: 'SMS', description: 'Текстовые сообщения' },
]);

export const EVENTS = Object.freeze([
  { id: 'review', label: 'Новый отзыв', tone: 'amber', icon: 'review' },
  { id: 'overdueTask', label: 'Просроченная задача', tone: 'violet', icon: 'task' },
  { id: 'completedTask', label: 'Задача выполнена', tone: 'violet', icon: 'task' },
  { id: 'reportReady', label: 'Отчёт готов', tone: 'purple', icon: 'report' },
  { id: 'message', label: 'Новое сообщение', tone: 'green', icon: 'chat' },
  { id: 'subscription', label: 'Истекает подписка', tone: 'red', icon: 'system' },
]);

const now = Date.now();
const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;

export const DEFAULT_NOTIFICATIONS_SNAPSHOT = Object.freeze({
  version: 1,
  preferences: {
    activeTab: 'unread',
    activeType: 'all',
  },
  settings: {
    channels: {
      email: true,
      telegram: true,
      push: false,
      sms: false,
    },
    events: {
      review: true,
      overdueTask: true,
      completedTask: true,
      reportReady: true,
      message: true,
      subscription: true,
    },
    quietHours: {
      enabled: true,
      from: '22:00',
      to: '09:00',
    },
  },
  notifications: [
    {
      id: 'notification-review-1',
      type: 'reviews',
      title: 'Новый отзыв на 2GIS',
      text: 'Получен отзыв с оценкой 2/5. Рекомендуем ответить в течение рабочего дня.',
      createdAt: now - 5 * minute,
      unread: true,
      tone: 'amber',
      actionLabel: 'Открыть отзыв',
      actionRoute: '/reviews?review=rv-001',
    },
    {
      id: 'notification-task-overdue',
      type: 'tasks',
      title: 'Задача просрочена',
      text: 'Задача «Ответить на отзывы 2GIS» просрочена на 2 дня.',
      createdAt: now - hour,
      unread: true,
      tone: 'violet',
      actionLabel: 'Перейти к задачам',
      actionRoute: '/tasks',
    },
    {
      id: 'notification-report-ready',
      type: 'reports',
      title: 'Отчёт готов',
      text: 'Ежемесячный отчёт по репутации сформирован и доступен для скачивания.',
      createdAt: now - 2 * hour,
      unread: true,
      tone: 'purple',
      actionLabel: 'Открыть отчёт',
      actionRoute: '/reports',
    },
    {
      id: 'notification-chat',
      type: 'chat',
      title: 'Сообщение от менеджера',
      text: 'Алексей ответил на ваш вопрос о стратегии работы с отзывами.',
      createdAt: now - 3 * hour,
      unread: false,
      tone: 'green',
      actionLabel: 'Открыть чат',
      actionRoute: '/chat',
    },
    {
      id: 'notification-task-done',
      type: 'tasks',
      title: 'Задача выполнена',
      text: 'Команда выполнила задачу «Тренинг сотрудников по отзывам».',
      createdAt: now - 2 * day,
      unread: false,
      tone: 'green',
      actionLabel: 'Посмотреть задачу',
      actionRoute: '/tasks',
    },
    {
      id: 'notification-subscription',
      type: 'system',
      title: 'Подписка скоро истекает',
      text: 'Тариф «Профессионал» истекает через 3 дня. Продлите его, чтобы сервисы продолжили работать без паузы.',
      createdAt: now - day,
      unread: false,
      tone: 'red',
      actionLabel: 'Продлить подписку',
      actionRoute: '/subscriptions',
    },
    {
      id: 'notification-system',
      type: 'system',
      title: 'Обновление системы',
      text: 'Мы обновили аналитику и ускорили работу кабинета. Все изменения уже доступны.',
      createdAt: now - 5 * day,
      unread: false,
      tone: 'blue',
      actionLabel: '',
      actionRoute: '',
    },
  ],
});

export const TYPE_META = Object.freeze({
  reviews: { label: 'Отзывы', icon: 'review' },
  tasks: { label: 'Задачи', icon: 'task' },
  reports: { label: 'Отчёты', icon: 'report' },
  chat: { label: 'Чат', icon: 'chat' },
  system: { label: 'Система', icon: 'system' },
});

export function formatNotificationTime(timestamp) {
  const diff = Math.max(0, Date.now() - timestamp);
  if (diff < minute) return 'только что';
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} мин назад`;
  if (diff < day) {
    const hours = Math.floor(diff / hour);
    return `${hours} ${hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'} назад`;
  }

  const days = Math.floor(diff / day);
  if (days === 1) return 'вчера';
  if (days < 5) return `${days} дня назад`;
  return `${days} дней назад`;
}
