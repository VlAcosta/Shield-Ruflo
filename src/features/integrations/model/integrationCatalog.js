export const INTEGRATION_ITEMS = Object.freeze([
  {
    id: 'yandex',
    name: 'Яндекс.Бизнес',
    shortName: 'Яндекс',
    category: 'Отзывы',
    description: 'Отзывы и ответы через verified partner/API bridge без HTML-скрейпинга',
    placeholder: 'ID или ссылка организации Яндекс Бизнес',
    recommended: true,
    tone: 'amber',
    sourceType: 'reviews',
    priority: 1,
  },
  {
    id: 'gis',
    name: '2GIS',
    shortName: '2GIS',
    category: 'Карточка компании',
    description: 'Официальный Places API: карточка и статистика отзывов; тексты отзывов API не предоставляет',
    placeholder: 'ID организации или https://2gis.ru/.../firm/ID',
    recommended: true,
    tone: 'green',
    sourceType: 'profile',
    priority: 2,
  },
  {
    id: 'ozon',
    name: 'Ozon',
    shortName: 'Ozon',
    category: 'Маркетплейс',
    description: 'Отзывы покупателей и ответы через Ozon Seller API',
    placeholder: 'Ссылка продавца или идентификатор',
    recommended: true,
    tone: 'blue',
    sourceType: 'marketplace',
    priority: 3,
  },
  {
    id: 'otzovik',
    name: 'Отзовик',
    shortName: 'Отзовик',
    category: 'Отзывы',
    description: 'Отзывы и ответы через verified bridge; неавторизованный скрейпинг не используется',
    placeholder: 'ID или ссылка страницы компании',
    recommended: true,
    tone: 'violet',
    sourceType: 'reviews',
    priority: 4,
  },
  {
    id: 'wb',
    name: 'Wildberries',
    shortName: 'WB',
    category: 'Маркетплейс',
    description: 'Отзывы покупателей и публикация ответов через официальный WB API',
    placeholder: 'Артикул WB или https://www.wildberries.ru/catalog/...',
    recommended: true,
    tone: 'pink',
    sourceType: 'marketplace',
    priority: 5,
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    shortName: 'Telegram',
    category: 'Коммуникации',
    description: 'Уведомления, дайджесты и быстрые команды',
    placeholder: 'https://t.me/...',
    recommended: false,
    tone: 'cyan',
    sourceType: 'communications',
    priority: 30,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    shortName: 'WhatsApp',
    category: 'Коммуникации',
    description: 'Связь с командой в WhatsApp Business',
    placeholder: 'https://wa.me/...',
    recommended: false,
    tone: 'emerald',
    sourceType: 'communications',
    priority: 31,
  },
  {
    id: 'amo',
    name: 'AmoCRM',
    shortName: 'AmoCRM',
    category: 'CRM',
    description: 'Синхронизация клиентов, задач и рабочих событий',
    placeholder: 'https://company.amocrm.ru',
    recommended: false,
    tone: 'violet',
    sourceType: 'crm',
    priority: 40,
  },
]);

export const INTEGRATION_BY_ID = Object.freeze(
  INTEGRATION_ITEMS.reduce((result, item) => {
    result[item.id] = item;
    return result;
  }, {}),
);

export const INTEGRATION_STATUS_META = Object.freeze({
  connected: { label: 'Подключено', shortLabel: 'Online', tone: 'success' },
  syncing: { label: 'Синхронизация', shortLabel: 'Sync', tone: 'info' },
  configured: { label: 'Настроено', shortLabel: 'Ready', tone: 'violet' },
  needs_setup: { label: 'Нужна настройка', shortLabel: 'Setup', tone: 'warning' },
  degraded: { label: 'Требует внимания', shortLabel: 'Warning', tone: 'warning' },
  expired: { label: 'Требуется вход', shortLabel: 'Reconnect', tone: 'danger' },
  error: { label: 'Ошибка', shortLabel: 'Error', tone: 'danger' },
  disconnected: { label: 'Не подключено', shortLabel: 'Offline', tone: 'neutral' },
});

export function createDefaultIntegrations() {
  return INTEGRATION_ITEMS.reduce((result, item) => {
    result[item.id] = {
      enabled: item.recommended,
      link: '',
    };
    return result;
  }, {});
}
