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
const reviews = { to: '/reviews', label: 'Отзывы', Icon: ReviewsIcon, permission: 'reviews.view' };
const reputation = { to: '/reputation', label: 'Репутация', Icon: ReputationIcon, permission: 'analytics.view' };
const growth = { to: '/acquisition', label: 'Рост', Icon: ReviewsIcon, permission: 'acquisition.view' };
const work = { to: '/tasks', label: 'Работа', Icon: TasksIcon, permission: 'tasks.view' };
const settings = { to: '/profile', label: 'Настройки', Icon: ProfileIcon };

/**
 * Sidebar information architecture intentionally stays small.
 * Specialized tools remain routable and permission-aware, but are opened from
 * their parent workspace instead of competing for permanent sidebar space.
 */
export const navigationPrimary = Object.freeze([
  dashboard,
  reviews,
  reputation,
  growth,
  work,
  settings,
]);

export const navigationGroups = Object.freeze([]);
export const navigationHelp = Object.freeze({ to: '/faq', label: 'Помощь', Icon: FaqIcon, permission: 'support.view' });

const secondaryRoutes = Object.freeze([
  { to: '/cases', label: 'Кейсы', Icon: ReputationIcon, permission: 'cases.view' },
  { to: '/competitive', label: 'Конкуренты', Icon: ReputationIcon, permission: 'competitive.view' },
  { to: '/ai-visibility', label: 'AI Visibility', Icon: ReputationIcon, permission: 'ai_visibility.view' },
  { to: '/ask-shield', label: 'Ask Shield', Icon: ReputationIcon, permission: 'analytics.view' },
  { to: '/location-health', label: 'Локации', Icon: ReputationIcon, permission: 'locations.view' },
  { to: '/automations', label: 'Автоматизации', Icon: AutomationIcon, permission: 'automations.view' },
  { to: '/reports', label: 'Отчёты', Icon: ReportsIcon, permission: 'reports.view' },
  { to: '/integrations', label: 'Интеграции', Icon: IntegrationIcon, permission: 'integrations.view' },
  { to: '/subscriptions', label: 'Тариф и оплата', Icon: SubscriptionsIcon, permission: 'billing.view' },
]);

// Compatibility catalog for route/access helpers. Do not use it to render the sidebar.
export const navigationItems = Object.freeze([
  ...navigationPrimary,
  ...secondaryRoutes,
  navigationHelp,
]);
