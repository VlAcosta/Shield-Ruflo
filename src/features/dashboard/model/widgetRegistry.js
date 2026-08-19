import ReviewsChart from '../ReviewsChart';
import TasksChart from '../TasksChart';
import Checklist from '../Checklist';
import Rating from '../Rating';
import Processes from '../Processes';
import Reports from '../Reports';
import Calendar from '../Calendar';
import Suggestions from '../Suggestions';
import Team from '../Team';
import Security from '../Security';
import Competitors from '../Competitors';
import QuickActions from '../QuickActions';
import Integrations from '../Integrations';

export const DASHBOARD_LAYOUT_VERSION = 7;

export const DASHBOARD_DENSITIES = Object.freeze({
  comfortable: 'comfortable',
  compact: 'compact',
});

export const WIDGET_REGISTRY = Object.freeze({
  reviews: {
    id: 'reviews',
    title: 'Динамика отзывов',
    description: 'Рост отзывов и динамика по периодам',
    component: ReviewsChart,
    permission: 'reviews.view',
    defaultSpan: 7,
    minSpan: 5,
    maxSpan: 12,
  },
  tasks: {
    id: 'tasks',
    title: 'Задачи',
    description: 'Распределение задач по проектам',
    component: TasksChart,
    permission: 'tasks.view',
    defaultSpan: 5,
    minSpan: 4,
    maxSpan: 8,
  },
  checklist: {
    id: 'checklist',
    title: 'Чек-лист',
    description: 'Текущие задачи, приоритеты и исполнители',
    component: Checklist,
    permission: 'tasks.view',
    defaultSpan: 8,
    minSpan: 6,
    maxSpan: 12,
  },
  rating: {
    id: 'rating',
    title: 'Общий рейтинг',
    description: 'Средняя оценка и динамика рейтинга',
    component: Rating,
    permission: 'analytics.view',
    defaultSpan: 4,
    minSpan: 3,
    maxSpan: 6,
  },
  processes: {
    id: 'processes',
    title: 'Процессы',
    description: 'Статусы рабочих процессов',
    component: Processes,
    permission: 'tasks.view',
    defaultSpan: 4,
    minSpan: 3,
    maxSpan: 6,
  },
  reports: {
    id: 'reports',
    title: 'Отчёты',
    description: 'Последние сформированные отчёты',
    component: Reports,
    permission: 'reports.view',
    defaultSpan: 4,
    minSpan: 3,
    maxSpan: 6,
  },
  calendar: {
    id: 'calendar',
    title: 'Календарь',
    description: 'События и контрольные даты',
    component: Calendar,
    defaultSpan: 8,
    minSpan: 6,
    maxSpan: 12,
  },
  suggestions: {
    id: 'suggestions',
    title: 'Предложения',
    description: 'Быстрая отправка идеи команде',
    component: Suggestions,
    permission: 'support.write',
    defaultSpan: 3,
    minSpan: 3,
    maxSpan: 5,
  },
  team: {
    id: 'team',
    title: 'Команда',
    description: 'Участники и роли кабинета',
    component: Team,
    permission: 'team.view',
    defaultSpan: 3,
    minSpan: 3,
    maxSpan: 6,
  },
  integrations: {
    id: 'integrations',
    title: 'Интеграции',
    description: 'Подключённые площадки и источники данных',
    component: Integrations,
    permission: 'integrations.view',
    defaultSpan: 6,
    minSpan: 4,
    maxSpan: 12,
  },
  security: {
    id: 'security',
    title: 'Безопасность',
    description: 'Быстрый доступ к защите аккаунта',
    component: Security,
    defaultSpan: 3,
    minSpan: 3,
    maxSpan: 6,
  },
  competitors: {
    id: 'competitors',
    title: 'Конкуренты',
    description: 'Benchmark рейтинга, негатива и активности рынка',
    component: Competitors,
    permission: 'competitive.view',
    defaultSpan: 5,
    minSpan: 4,
    maxSpan: 8,
  },
  quick: {
    id: 'quick',
    title: 'Быстрые действия',
    description: 'Основные сценарии в один клик',
    component: QuickActions,
    defaultSpan: 12,
    minSpan: 6,
    maxSpan: 12,
  },
});

export const DEFAULT_WIDGET_ORDER = Object.freeze([
  'reviews',
  'tasks',
  'checklist',
  'rating',
  'processes',
  'reports',
  'calendar',
  'suggestions',
  'team',
  'integrations',
  'security',
  'competitors',
  'quick',
]);

export const DEFAULT_VISIBLE_WIDGET_IDS = Object.freeze([
  'reviews',
  'tasks',
  'rating',
  'quick',
]);

export function createDefaultDashboardLayout() {
  return {
    version: DASHBOARD_LAYOUT_VERSION,
    preferences: {
      density: DASHBOARD_DENSITIES.comfortable,
    },
    order: [...DEFAULT_WIDGET_ORDER],
    widgets: Object.fromEntries(
      DEFAULT_WIDGET_ORDER.map((id) => [
        id,
        {
          visible: DEFAULT_VISIBLE_WIDGET_IDS.includes(id),
          span: WIDGET_REGISTRY[id].defaultSpan,
        },
      ])
    ),
  };
}

export function normalizeDashboardLayout(layout) {
  const fallback = createDefaultDashboardLayout();

  if (!layout || typeof layout !== 'object') return fallback;

  const incomingOrder = Array.isArray(layout.order) ? layout.order : [];
  const safeOrder = incomingOrder.filter((id) => WIDGET_REGISTRY[id]);
  const missingIds = DEFAULT_WIDGET_ORDER.filter((id) => !safeOrder.includes(id));
  const order = [...safeOrder, ...missingIds];

  const density = Object.values(DASHBOARD_DENSITIES).includes(layout.preferences?.density)
    ? layout.preferences.density
    : fallback.preferences.density;

  const widgets = Object.fromEntries(
    DEFAULT_WIDGET_ORDER.map((id) => {
      const config = layout.widgets?.[id] || {};
      const meta = WIDGET_REGISTRY[id];
      const rawSpan = Number(config.span);
      const span = Number.isFinite(rawSpan)
        ? Math.min(meta.maxSpan, Math.max(meta.minSpan, Math.round(rawSpan)))
        : meta.defaultSpan;
      const visible = typeof config.visible === 'boolean'
        ? config.visible
        : fallback.widgets[id].visible;

      return [
        id,
        {
          visible,
          span,
        },
      ];
    })
  );

  return {
    version: DASHBOARD_LAYOUT_VERSION,
    preferences: {
      density,
    },
    order,
    widgets,
  };
}
