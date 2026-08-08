export const DEFAULT_NOTIFICATION_TRIGGERS = Object.freeze([
  { id:'newClient', label:'Новый клиент', description:'Уведомление при регистрации клиента', enabled:true },
  { id:'clientChurn', label:'Отток клиента', description:'Уведомление при отмене подписки', enabled:true },
  { id:'newTicket', label:'Новый тикет', description:'Уведомление при создании обращения', enabled:true },
  { id:'paymentReceived', label:'Платёж получен', description:'Уведомление при успешной оплате', enabled:true },
  { id:'lowRating', label:'Низкий рейтинг', description:'Рейтинг клиента ниже 3.0', enabled:true },
  { id:'reportReady', label:'Отчёт готов', description:'Уведомление при генерации отчёта', enabled:false },
]);

export const DEFAULT_SMTP_SETTINGS = Object.freeze({
  host:'smtp.gmail.com',
  port:587,
  email:'noreply@biznesshield.ru',
  password:'',
  secure:false,
});

export const DEFAULT_INTEGRATIONS = Object.freeze([
  { id:'yandex', name:'Яндекс.Бизнес', description:'Мониторинг отзывов на Яндекс.Картах', status:'connected', tone:'yellow', glyph:'Я' },
  { id:'telegram', name:'Telegram Bot', description:'Уведомления и команды через бот', status:'connected', tone:'blue', glyph:'T' },
  { id:'2gis', name:'2GIS', description:'Интеграция с городскими справочниками', status:'connected', tone:'green', glyph:'2' },
  { id:'whatsapp', name:'WhatsApp Business', description:'Уведомления через WhatsApp', status:'disconnected', tone:'green', glyph:'W' },
  { id:'google', name:'Google Business', description:'Google Maps и бизнес профиль', status:'connected', tone:'google', glyph:'G' },
  { id:'amocrm', name:'AmoCRM', description:'Синхронизация с CRM', status:'disconnected', tone:'purple', glyph:'A' },
]);

export const DEFAULT_REPLY_TEMPLATES = Object.freeze([
  { id:'negative', title:'Ответ на негативный отзыв', category:'Негативные', body:'Спасибо за обратную связь. Нам важно разобраться в ситуации. Пожалуйста, напишите нам детали обращения — мы проверим информацию и вернёмся с решением.', tone:'danger' },
  { id:'positive', title:'Благодарность за положительный', category:'Позитивные', body:'Спасибо за высокую оценку! Очень рады, что вам понравился опыт взаимодействия с нами. Будем ждать вас снова.', tone:'success' },
  { id:'neutral', title:'Приглашение на повторный визит', category:'Нейтральные', body:'Спасибо, что поделились впечатлением. Мы учтём замечания и будем рады видеть вас снова — постараемся сделать следующий опыт ещё лучше.', tone:'warning' },
]);

export const DEFAULT_SECURITY_SETTINGS = Object.freeze({
  sessionMinutes:60,
  pinAttempts:3,
  pinLockSeconds:30,
  minPinLength:4,
  require2fa:true,
  notifyNewIp:true,
});

export const DEFAULT_SECURITY_LOG = Object.freeze([
  { id:'sec-1', title:'Вход в Admin CRM', date:'17.02.2026 10:23', ip:'195.62.11.44', tone:'info' },
  { id:'sec-2', title:'Изменение тарифа клиента', date:'17.02.2026 11:45', ip:'195.62.11.44', tone:'violet' },
  { id:'sec-3', title:'Попытка входа с неверным PIN', date:'16.02.2026 22:10', ip:'178.90.44.11', tone:'danger' },
  { id:'sec-4', title:'Добавление менеджера', date:'15.02.2026 14:32', ip:'195.62.11.44', tone:'success' },
  { id:'sec-5', title:'Удаление шаблона ответа', date:'14.02.2026 16:18', ip:'195.62.11.44', tone:'warning' },
]);

export const SETTINGS_TABS = Object.freeze([
  { id:'plans', label:'Тарифы' },
  { id:'notifications', label:'Уведомления' },
  { id:'integrations', label:'Интеграции' },
  { id:'templates', label:'Шаблоны ответов' },
  { id:'security', label:'Безопасность' },
]);
