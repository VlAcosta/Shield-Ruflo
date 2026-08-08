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
  ChatIcon,
  FaqIcon,
} from './icons';

export const navigationItems = Object.freeze([
  { to: '/dashboard', label: 'Главная', Icon: HomeIcon, permission: 'dashboard.view' },
  { to: '/reviews', label: 'Отзывы', Icon: ReviewsIcon, permission: 'reviews.view' },
  { to: '/reputation', label: 'Репутация', Icon: ReputationIcon, permission: 'reputation.view' },
  { to: '/automations', label: 'Автоматизации', Icon: AutomationIcon, permission: 'automations.view' },
  { to: '/integrations', label: 'Интеграции', Icon: IntegrationIcon, permission: 'integrations.view' },
  { to: '/subscriptions', label: 'Подписки', Icon: SubscriptionsIcon, permission: 'billing.view' },
  { to: '/reports', label: 'Отчёты', Icon: ReportsIcon, permission: 'reports.view' },
  { to: '/tasks', label: 'Задачи', Icon: TasksIcon, permission: 'tasks.view' },
  { to: '/profile', label: 'Профиль', Icon: ProfileIcon },
  { to: '/chat', label: 'Чат с поддержкой', Icon: ChatIcon, permission: 'support.view' },
  { to: '/faq', label: 'FAQ', Icon: FaqIcon, permission: 'support.view' },
]);
