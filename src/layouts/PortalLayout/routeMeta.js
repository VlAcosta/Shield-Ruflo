export const PORTAL_ROUTE_META = Object.freeze({
  '/dashboard': { title: 'Главная страница', subtitle: 'Организация' },
  '/subscriptions': { title: 'Подписки', subtitle: 'Аккаунт' },
  '/reports': { title: 'Отчёты', subtitle: 'Аналитика' },
  '/tasks': { title: 'Задачи', subtitle: 'Управление' },
  '/profile': { title: 'Профиль', subtitle: 'Ваш профиль' },
  '/notifications': { title: 'Уведомления', subtitle: 'Центр' },
  '/chat': { title: 'Чат с поддержкой', subtitle: 'Поддержка' },
  '/faq': { title: 'FAQ', subtitle: 'Помощь' },
});

export function getPortalRouteMeta(pathname) {
  return PORTAL_ROUTE_META[pathname] || { title: '', subtitle: '' };
}
