import { GridIcon, UsersIcon, CardIcon, ManagerIcon, TicketIcon, ChartIcon, GearIcon } from './icons';

export const adminNavigation = Object.freeze([
  { id: 'dashboard', to: '/admin/dashboard', label: 'Дашборд', Icon: GridIcon, enabled: true },
  { id: 'clients', to: '/admin/clients', label: 'Клиенты', Icon: UsersIcon, enabled: true },
  { id: 'subscriptions', to: '/admin/subscriptions', label: 'Подписки', Icon: CardIcon, enabled: true },
  { id: 'managers', to: '/admin/managers', label: 'Менеджеры', Icon: ManagerIcon, enabled: true },
  { id: 'tickets', to: '/admin/tickets', label: 'Тикеты', Icon: TicketIcon, badge: 5, enabled: true },
  { id: 'analytics', to: '/admin/analytics', label: 'Аналитика', Icon: ChartIcon, enabled: true },
  { id: 'settings', to: '/admin/settings', label: 'Настройки', Icon: GearIcon, enabled: true },
]);
