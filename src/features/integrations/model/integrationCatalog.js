export const INTEGRATION_ITEMS = Object.freeze([
  {
    id: 'yandex',
    name: 'Яндекс.Бизнес',
    shortName: 'Яндекс',
    category: 'Отзывы',
    description: 'Отзывы, рейтинг и карточка организации в экосистеме Яндекса',
    placeholder: 'https://yandex.ru/maps/org/...',
    recommended: true,
    tone: 'amber',
    sourceType: 'reviews',
    priority: 1,
  },
  {
    id: 'gis',
    name: '2GIS',
    shortName: '2GIS',
    category: 'Отзывы',
    description: 'Отзывы, рейтинг и карточка компании в 2GIS',
    placeholder: 'https://2gis.ru/.../firm/...',
    recommended: true,
    tone: 'green',
    sourceType: 'reviews',
    priority: 2,
  },
  {
    id: 'ozon',
    name: 'Ozon',
    shortName: 'Ozon',
    category: 'Маркетплейс',
    description: 'Отзывы покупателей, рейтинг продавца и товарные сигналы',
    placeholder: 'https://www.ozon.ru/seller/...',
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
    description: 'Публичные отзывы и репутационный фон компании',
    placeholder: 'https://otzovik.com/reviews/...',
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
    description: 'Отзывы, рейтинг продавца и карточки товаров Wildberries',
    placeholder: 'https://www.wildberries.ru/seller/...',
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
