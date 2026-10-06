export const INTEGRATION_ITEMS = Object.freeze([
  {
    id: 'yandex',
    name: 'Яндекс.Бизнес',
    shortName: 'Яндекс',
    category: 'Отзывы',
    description: 'Собираем отзывы и помогаем отвечать после подключения доступного канала Яндекс Бизнес',
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
    description: 'Показываем данные карточки и статистику отзывов; доступность текстов зависит от возможностей 2GIS',
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
    description: 'Отзывы покупателей и ответы после подключения кабинета продавца Ozon',
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
    description: 'Собираем доступные отзывы и помогаем готовить ответы после подключения источника',
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
    description: 'Отзывы покупателей и ответы после подключения кабинета продавца Wildberries',
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
    description: 'Получайте уведомления и короткие сводки прямо в Telegram',
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
    description: 'Рабочие уведомления и связь с командой через WhatsApp Business',
    placeholder: 'https://wa.me/...',
    recommended: false,
    tone: 'emerald',
    sourceType: 'communications',
    priority: 31,
  },
  {
    id: 'amo',
    name: 'amoCRM',
    shortName: 'amoCRM',
    category: 'CRM',
    description: 'Связывайте клиентов, задачи и важные рабочие события с вашим кабинетом',
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
  connected: { label: 'Подключено', shortLabel: 'Работает', tone: 'success' },
  syncing: { label: 'Синхронизация', shortLabel: 'Обновление', tone: 'info' },
  configured: { label: 'Настроено', shortLabel: 'Готово', tone: 'violet' },
  needs_setup: { label: 'Нужна настройка', shortLabel: 'Настроить', tone: 'warning' },
  degraded: { label: 'Требует внимания', shortLabel: 'Проверить', tone: 'warning' },
  expired: { label: 'Требуется вход', shortLabel: 'Войти снова', tone: 'danger' },
  error: { label: 'Ошибка', shortLabel: 'Ошибка', tone: 'danger' },
  disconnected: { label: 'Не подключено', shortLabel: 'Отключено', tone: 'neutral' },
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
