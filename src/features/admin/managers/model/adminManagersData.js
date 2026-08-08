export const DEFAULT_ADMIN_MANAGERS = Object.freeze([
  {
    id: 'alexey',
    initials: 'АВ',
    name: 'Алексей Воронов',
    shortName: 'Алексей',
    email: 'a.voronov@biznesshield.ru',
    phone: '+7 (999) 111-22-33',
    role: 'Персональный менеджер',
    joinedAt: '01.03.2025',
    status: 'active',
    statusLabel: 'Активен',
    rating: 4.8,
    openTickets: 3,
    capacity: 6,
    tone: 'violet',
    responseTime: 18,
    satisfaction: 96,
    performance: [72, 76, 79, 81, 88, 91, 94],
  },
  {
    id: 'maria',
    initials: 'МЗ',
    name: 'Мария Захарова',
    shortName: 'Мария',
    email: 'm.zakharova@biznesshield.ru',
    phone: '+7 (999) 222-33-44',
    role: 'Персональный менеджер',
    joinedAt: '15.04.2025',
    status: 'active',
    statusLabel: 'Активен',
    rating: 4.6,
    openTickets: 5,
    capacity: 6,
    tone: 'purple',
    responseTime: 26,
    satisfaction: 91,
    performance: [64, 69, 67, 73, 77, 80, 84],
  },
  {
    id: 'dmitry',
    initials: 'ДК',
    name: 'Дмитрий Козлов',
    shortName: 'Дмитрий',
    email: 'd.kozlov@biznesshield.ru',
    phone: '+7 (999) 333-44-55',
    role: 'Персональный менеджер',
    joinedAt: '20.01.2025',
    status: 'active',
    statusLabel: 'Активен',
    rating: 4.9,
    openTickets: 1,
    capacity: 6,
    tone: 'green',
    responseTime: 12,
    satisfaction: 98,
    performance: [80, 82, 86, 85, 91, 94, 97],
  },
  {
    id: 'svetlana',
    initials: 'СН',
    name: 'Светлана Новикова',
    shortName: 'Светлана',
    email: 's.novikova@biznesshield.ru',
    phone: '+7 (999) 444-55-66',
    role: 'Менеджер-стажёр',
    joinedAt: '17.02.2026',
    status: 'training',
    statusLabel: 'Обучение',
    rating: 0,
    openTickets: 0,
    capacity: 4,
    tone: 'orange',
    responseTime: 0,
    satisfaction: 0,
    performance: [12, 18, 24, 29, 36, 43, 48],
  },
]);

export const ADMIN_MANAGER_STATUS_OPTIONS = Object.freeze([
  { id: 'active', label: 'Активен' },
  { id: 'training', label: 'Обучение' },
  { id: 'paused', label: 'Приостановлен' },
]);

export function initialsForManager(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'МН';
}
