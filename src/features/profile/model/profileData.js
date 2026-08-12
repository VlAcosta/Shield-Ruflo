export const PROFILE_TABS = Object.freeze([
  { id: 'personal', label: 'Аккаунт' },
  { id: 'company', label: 'Компания' },
  { id: 'security', label: 'Безопасность' },
  { id: 'appearance', label: 'Оформление' },
  { id: 'users', label: 'Команда' },
  { id: 'system', label: 'Система' },
]);

export const USER_ROLES = Object.freeze([
  { id: 'admin', label: 'Администратор' },
  { id: 'moderator', label: 'Модератор' },
  { id: 'guest', label: 'Гость' },
]);

export const DEFAULT_PROFILE_SNAPSHOT = Object.freeze({
  version: 1,
  personal: {
    firstName: 'Лучший',
    lastName: 'Клиент',
    email: 'client@biznesshield.ru',
    phone: '+7 (999) 123-45-67',
    position: 'Директор',
    telegram: '@client',
    avatar: '',
    stats: {
      reports: 17,
      score: '9.7k',
      days: 274,
    },
  },
  company: {
    title: 'ООО "ВНАЛ"',
    inn: '7701234567',
    kpp: '770101001',
    ogrn: '1027701234567',
    legalAddress: 'г. Москва, ул. Тверская, д. 1',
    registrationDate: '17.08.2025',
    registryStatus: 'Действующая организация',
    registrySource: 'ЕГРЮЛ / ФНС',
    verified: false,
    website: 'vnal.ru',
    industry: 'Торговля',
  },
  sessions: [
    {
      id: 'session-current',
      title: 'Chrome / Windows',
      ip: '',
      location: '',
      time: 'Сейчас',
      current: true,
      device: 'desktop',
    },
    {
      id: 'session-mobile',
      title: 'Safari / iPhone',
      ip: '',
      location: '',
      time: '2 часа назад',
      current: false,
      device: 'mobile',
    },
    {
      id: 'session-mac',
      title: 'Firefox / macOS',
      ip: '',
      location: '',
      time: '3 дня назад',
      current: false,
      device: 'desktop',
    },
  ],
  users: [
    {
      id: 'user-led',
      initials: 'АП',
      name: 'Анна Петрова',
      subtitle: 'Директор',
      email: 'anna@company.ru',
      role: 'admin',
      active: true,
      tone: 'violet',
    },
    {
      id: 'user-stepan',
      initials: 'МО',
      name: 'Михаил Орлов',
      subtitle: 'Руководитель',
      email: 'mikhail@company.ru',
      role: 'moderator',
      active: true,
      tone: 'purple',
    },
    {
      id: 'user-jason',
      initials: 'ЕС',
      name: 'Елена Смирнова',
      subtitle: 'Партнёр',
      email: 'elena@company.ru',
      role: 'guest',
      active: false,
      tone: 'orange',
    },
  ],
});

export function getInitials(firstName = '', lastName = '') {
  return `${firstName.trim().slice(0, 1)}${lastName.trim().slice(0, 1)}`.toUpperCase() || 'БЩ';
}
