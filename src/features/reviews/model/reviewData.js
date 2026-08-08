const isoHoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

export const REVIEW_STATUS = Object.freeze({
  NEW: 'new',
  DEFERRED: 'deferred',
  DONE: 'done',
});

export const REVIEW_WORKFLOW = Object.freeze({
  INBOX: 'inbox',
  DRAFT: 'draft',
  APPROVAL: 'approval',
  APPROVED: 'approved',
  SHIELD: 'shield',
  PUBLISHED: 'published',
  LEGAL: 'legal',
});

export const REVIEW_STATUS_LABELS = Object.freeze({
  [REVIEW_STATUS.NEW]: 'Требуют ответа',
  [REVIEW_STATUS.DEFERRED]: 'Отложенные',
  [REVIEW_STATUS.DONE]: 'Обработанные',
});

export const REVIEW_TABS = Object.freeze([
  { value: REVIEW_STATUS.NEW, label: 'Требуют ответа' },
  { value: REVIEW_STATUS.DEFERRED, label: 'Отложенные' },
  { value: REVIEW_STATUS.DONE, label: 'Обработанные' },
]);

export const REVIEW_PLATFORMS = Object.freeze([
  'Все площадки',
  'Яндекс',
  '2GIS',
  'Ozon',
  'Отзовик',
  'WB',
]);

export const REVIEW_RATINGS = Object.freeze([
  { value: 'all', label: 'Любой рейтинг' },
  { value: '1', label: '1 звезда' },
  { value: '2', label: '2 звезды' },
  { value: '3', label: '3 звезды' },
  { value: '4', label: '4 звезды' },
  { value: '5', label: '5 звёзд' },
]);

export const REVIEW_SENTIMENT = Object.freeze({
  NEGATIVE: 'negative',
  NEUTRAL: 'neutral',
  POSITIVE: 'positive',
});

export const REVIEW_RESPONSE_MODES = Object.freeze([
  {
    id: 'client',
    label: 'Клиент отвечает сам',
    short: 'Команда компании',
    description: 'Сотрудники компании готовят и публикуют ответы самостоятельно.',
  },
  {
    id: 'shield',
    label: 'Отвечает Бизнес Щит',
    short: 'Бизнес Щит',
    description: 'Черновик и публикацию берёт на себя команда Бизнес Щит.',
  },
  {
    id: 'approval',
    label: 'Через согласование',
    short: 'Согласование',
    description: 'Исполнитель готовит ответ, руководитель подтверждает перед публикацией.',
  },
]);

export const REVIEW_TONE_PRESETS = Object.freeze([
  { id: 'official', label: 'Официальный', description: 'Сдержанно, уважительно и без разговорных оборотов.' },
  { id: 'friendly', label: 'Дружелюбный', description: 'Тепло, человечно и спокойно, без фамильярности.' },
  { id: 'concise', label: 'Короткий', description: 'Минимум текста, только суть и следующий шаг.' },
  { id: 'expert', label: 'Экспертный', description: 'Уверенно, предметно и с пояснением решения.' },
]);

export const REVIEW_REASON_CATEGORIES = Object.freeze([
  'качество',
  'персонал',
  'цена',
  'доставка',
  'сервис',
  'ожидание',
  'чистота',
  'товар',
  'описание',
  'возврат',
]);

export const REVIEW_REPLY_TEMPLATES = Object.freeze([
  'Спасибо за обратную связь. Нам важно разобраться в ситуации.',
  'Приносим извинения за неудобства. Уже передали информацию ответственному сотруднику.',
  'Спасибо, что поделились впечатлением. Будем рады уточнить детали и помочь.',
]);

export const DEFAULT_REVIEW_SETTINGS = Object.freeze({
  responseMode: 'approval',
  tonePreset: 'friendly',
  toneInstruction: 'Пишем спокойно, по-человечески, без канцелярита. Не спорим с клиентом и всегда предлагаем следующий шаг.',
  autoCreateNegativeTask: true,
  aiReasonsEnabled: true,
  legalEscalationEnabled: true,
  slaHours: {
    '1': 6,
    '2': 6,
    '3': 16,
    '4': 24,
    '5': 24,
  },
});

export function sentimentByRating(rating) {
  const value = Number(rating || 0);
  if (value <= 3) return REVIEW_SENTIMENT.NEGATIVE;
  if (value === 4) return REVIEW_SENTIMENT.NEUTRAL;
  return REVIEW_SENTIMENT.POSITIVE;
}

export function slaHoursByRating(rating, settings = DEFAULT_REVIEW_SETTINGS) {
  return Number(settings?.slaHours?.[String(rating)] || (Number(rating) <= 2 ? 6 : Number(rating) === 3 ? 16 : 24));
}

export const DEFAULT_REVIEWS = Object.freeze([
  {
    id: 'rv-001', externalId: 'yandex-88231', author: 'Иван Петров', initials: 'ИП', platform: 'Яндекс', rating: 2,
    createdAt: isoHoursAgo(4.3), date: 'сегодня', time: '15:03',
    text: 'Очень долго ждали заказ, персонал отвечал грубо. Хотелось бы, чтобы руководство обратило внимание.',
    status: REVIEW_STATUS.NEW, workflowStatus: REVIEW_WORKFLOW.INBOX, source: 'Яндекс Карты · Тула',
    tags: ['персонал', 'ожидание'], aiReasons: ['персонал', 'ожидание'], reply: '', assignee: 'Мария Новикова',
    approval: null, legalCase: null, taskId: '',
  },
  {
    id: 'rv-002', externalId: '2gis-12093', author: 'Анна Сидорова', initials: 'АС', platform: '2GIS', rating: 1,
    createdAt: isoHoursAgo(7.1), date: 'сегодня', time: '12:14',
    text: 'Качество товара плохое, деньги возвращать отказались. Никому не рекомендую.',
    status: REVIEW_STATUS.NEW, workflowStatus: REVIEW_WORKFLOW.DRAFT, source: '2GIS · филиал Центральный',
    tags: ['качество', 'возврат'], aiReasons: ['качество', 'возврат'], reply: 'Анна, спасибо, что написали. Нам важно разобраться в ситуации с качеством и возвратом. Пожалуйста, пришлите номер заказа в личные сообщения — руководитель проверит обращение и вернётся к вам с решением.', assignee: 'Алексей Воронов',
    approval: null, legalCase: null, taskId: '',
  },
  {
    id: 'rv-003', externalId: 'ozon-99542', author: 'Сергей Козлов', initials: 'СК', platform: 'Ozon', rating: 3,
    createdAt: isoHoursAgo(9.4), date: 'сегодня', time: '09:51',
    text: 'Сам товар нормальный, но приехал позже обещанного срока и упаковка была помята.',
    status: REVIEW_STATUS.NEW, workflowStatus: REVIEW_WORKFLOW.APPROVAL, source: 'Ozon · карточка товара',
    tags: ['доставка', 'товар'], aiReasons: ['доставка'], reply: 'Сергей, благодарим за отзыв. Рады, что сам товар вас устроил. За задержку и состояние упаковки приносим извинения — передадим информацию команде логистики и проверим доставку по вашему заказу.', assignee: 'Мария Новикова',
    approval: { status: 'pending', requestedAt: isoHoursAgo(0.8), requestedBy: 'Мария Новикова' }, legalCase: null, taskId: '',
  },
  {
    id: 'rv-004', externalId: 'otzovik-55212', author: 'Мария Новикова', initials: 'МН', platform: 'Отзовик', rating: 2,
    createdAt: isoHoursAgo(22), date: 'вчера', time: '21:18',
    text: 'Компания вводит покупателей в заблуждение: описание услуги не соответствует тому, что получаешь по факту.',
    status: REVIEW_STATUS.DEFERRED, workflowStatus: REVIEW_WORKFLOW.LEGAL, source: 'Отзовик · карточка компании',
    tags: ['описание', 'спорный'], aiReasons: ['описание'], reply: '', assignee: 'Юридический отдел',
    approval: null,
    legalCase: { status: 'precheck', reason: 'Возможное недостоверное утверждение', evidence: ['Скриншот карточки услуги'], openedAt: isoHoursAgo(3) }, taskId: '',
  },
  {
    id: 'rv-005', externalId: 'wb-83922', author: 'Ольга Крылова', initials: 'ОК', platform: 'WB', rating: 5,
    createdAt: isoHoursAgo(16), date: 'вчера', time: '18:41',
    text: 'Отличная упаковка и быстрая доставка. Всё соответствует описанию, спасибо!',
    status: REVIEW_STATUS.DONE, workflowStatus: REVIEW_WORKFLOW.PUBLISHED, source: 'Wildberries · товар 4839221',
    tags: ['доставка', 'качество'], aiReasons: ['доставка', 'качество'],
    reply: 'Ольга, спасибо за тёплые слова! Очень рады, что заказ и доставка вас порадовали.', repliedAt: isoHoursAgo(14), assignee: 'Бизнес Щит', approval: null, legalCase: null, taskId: '',
  },
  {
    id: 'rv-006', externalId: 'yandex-88319', author: 'Алексей Миронов', initials: 'АМ', platform: 'Яндекс', rating: 4,
    createdAt: isoHoursAgo(20), date: 'вчера', time: '14:10',
    text: 'В целом всё хорошо. Хотелось бы немного быстрее получать заказ в часы пик.',
    status: REVIEW_STATUS.DONE, workflowStatus: REVIEW_WORKFLOW.PUBLISHED, source: 'Яндекс Карты · Тула',
    tags: ['ожидание'], aiReasons: ['ожидание'], reply: 'Алексей, благодарим за отзыв. Учтём замечание по скорости обслуживания в часы пик.', repliedAt: isoHoursAgo(18), assignee: 'Мария Новикова', approval: null, legalCase: null, taskId: '',
  },
  {
    id: 'rv-007', externalId: 'ozon-99211', author: 'Елена Волкова', initials: 'ЕВ', platform: 'Ozon', rating: 1,
    createdAt: isoHoursAgo(2.2), date: 'сегодня', time: '17:08',
    text: 'Пришёл другой цвет. Поддержка продавца пока не ответила.',
    status: REVIEW_STATUS.NEW, workflowStatus: REVIEW_WORKFLOW.INBOX, source: 'Ozon · карточка товара',
    tags: ['товар', 'сервис'], aiReasons: ['товар', 'сервис'], reply: '', assignee: '', approval: null, legalCase: null, taskId: '',
  },
  {
    id: 'rv-008', externalId: 'wb-83111', author: 'Никита Фролов', initials: 'НФ', platform: 'WB', rating: 3,
    createdAt: isoHoursAgo(17.4), date: 'вчера', time: '16:22',
    text: 'Цена нормальная, но качество могло быть лучше. Второй раз, наверное, не возьму.',
    status: REVIEW_STATUS.NEW, workflowStatus: REVIEW_WORKFLOW.INBOX, source: 'Wildberries · товар 994321',
    tags: ['цена', 'качество'], aiReasons: ['цена', 'качество'], reply: '', assignee: '', approval: null, legalCase: null, taskId: '',
  },
]);
