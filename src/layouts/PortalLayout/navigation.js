import {
  HomeIcon,
  SubscriptionsIcon,
  ReportsIcon,
  ReviewsIcon,
  ReputationIcon,
  AutomationIcon,
  IntegrationIcon,
  TasksIcon,
  ProfileIcon,
  FaqIcon,
} from './icons';

const dashboard = { to: '/dashboard', label: 'Главная', Icon: HomeIcon, permission: 'dashboard.view' };
const askShield = { to: '/ask-shield', label: 'Ask Shield', Icon: ReputationIcon, permission: 'analytics.view', accent: true };

export const navigationGroups = Object.freeze([
  {
    id: 'reputation',
    label: 'Репутация',
    Icon: ReputationIcon,
    items: [
      { to: '/reviews', label: 'Отзывы', Icon: ReviewsIcon, permission: 'reviews.view' },
      { to: '/cases', label: 'Кейсы', Icon: ReputationIcon, permission: 'cases.view' },
      { to: '/reputation', label: 'Аналитика', Icon: ReputationIcon, permission: 'analytics.view' },
      { to: '/competitive', label: 'Конкуренты', Icon: ReputationIcon, permission: 'competitive.view' },
      { to: '/ai-visibility', label: 'AI Visibility', Icon: ReputationIcon, permission: 'ai_visibility.view' },
    ],
  },
  {
    id: 'growth',
    label: 'Рост и точки',
    Icon: ReviewsIcon,
    items: [
      { to: '/acquisition', label: 'Сбор отзывов', Icon: ReviewsIcon, permission: 'acquisition.view' },
      { to: '/location-health', label: 'Локации', Icon: ReputationIcon, permission: 'locations.view' },
    ],
  },
  {
    id: 'work',
    label: 'Работа',
    Icon: TasksIcon,
    items: [
      { to: '/tasks', label: 'Задачи', Icon: TasksIcon, permission: 'tasks.view' },
      { to: '/automations', label: 'Автоматизации', Icon: AutomationIcon, permission: 'automations.view' },
      { to: '/reports', label: 'Отчёты', Icon: ReportsIcon, permission: 'reports.view' },
    ],
  },
  {
    id: 'settings',
    label: 'Настройки',
    Icon: ProfileIcon,
    items: [
      { to: '/profile', label: 'Аккаунт и компания', Icon: ProfileIcon },
      { to: '/integrations', label: 'Интеграции', Icon: IntegrationIcon, permission: 'integrations.view' },
      { to: '/subscriptions', label: 'Тариф и оплата', Icon: SubscriptionsIcon, permission: 'billing.view' },
    ],
  },
]);

export const navigationPrimary = Object.freeze([dashboard, askShield]);
export const navigationHelp = Object.freeze({ to: '/faq', label: 'Помощь', Icon: FaqIcon, permission: 'support.view' });

// Compatibility list for access helpers and existing route logic.
export const navigationItems = Object.freeze([
  dashboard,
  ...navigationGroups.flatMap((group) => group.items),
  askShield,
  navigationHelp,
]);
