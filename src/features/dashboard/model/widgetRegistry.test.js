import {
  DEFAULT_VISIBLE_WIDGET_IDS,
  DEFAULT_WIDGET_ORDER,
  WIDGET_REGISTRY,
  createDefaultDashboardLayout,
  normalizeDashboardLayout,
} from './widgetRegistry';

describe('dashboard widget registry', () => {
  test('default layout contains every registered widget but starts with a focused visible set', () => {
    const layout = createDefaultDashboardLayout();

    expect(layout.order).toEqual(DEFAULT_WIDGET_ORDER);

    expect(layout.order).toEqual(
      expect.arrayContaining([
        'reviews',
        'tasks',
        'checklist',
        'rating',
        'processes',
        'reports',
        'calendar',
        'team',
        'integrations',
        'security',
        'competitors',
        'quick',
      ]),
    );

    layout.order.forEach((id) => {
      expect(WIDGET_REGISTRY[id]).toBeDefined();
      expect(layout.widgets[id]).toEqual(
        expect.objectContaining({
          visible: DEFAULT_VISIBLE_WIDGET_IDS.includes(id),
        }),
      );
    });

    expect(DEFAULT_VISIBLE_WIDGET_IDS).toEqual(['reviews', 'tasks', 'rating', 'quick']);
  });

  test('normalization removes unknown widgets and restores missing registered widgets', () => {
    const normalized = normalizeDashboardLayout({
      order: ['reviews', 'unknown-widget', 'rating'],
      widgets: {
        reviews: {
          visible: true,
          span: 999,
        },
      },
    });

    expect(normalized.order).not.toContain('unknown-widget');

    expect(normalized.order).toEqual(
      expect.arrayContaining(DEFAULT_WIDGET_ORDER),
    );

    expect(normalized.widgets.reviews.span).toBeLessThanOrEqual(
      WIDGET_REGISTRY.reviews.maxSpan,
    );
  });

  test('normalization preserves an existing user visibility choice', () => {
    const normalized = normalizeDashboardLayout({
      order: DEFAULT_WIDGET_ORDER,
      widgets: {
        reviews: { visible: false, span: WIDGET_REGISTRY.reviews.defaultSpan },
        calendar: { visible: true, span: WIDGET_REGISTRY.calendar.defaultSpan },
      },
    });

    expect(normalized.widgets.reviews.visible).toBe(false);
    expect(normalized.widgets.calendar.visible).toBe(true);
    expect(normalized.widgets.checklist.visible).toBe(false);
  });

  test('permission-scoped organization data widgets declare their view boundary', () => {
    expect(WIDGET_REGISTRY.reviews.permission).toBe('reviews.view');
    expect(WIDGET_REGISTRY.tasks.permission).toBe('tasks.view');
    expect(WIDGET_REGISTRY.checklist.permission).toBe('tasks.view');
    expect(WIDGET_REGISTRY.rating.permission).toBe('analytics.view');
    expect(WIDGET_REGISTRY.processes.permission).toBe('tasks.view');
    expect(WIDGET_REGISTRY.reports.permission).toBe('reports.view');
    expect(WIDGET_REGISTRY.suggestions.permission).toBe('support.write');
    expect(WIDGET_REGISTRY.team.permission).toBe('team.view');
    expect(WIDGET_REGISTRY.integrations.permission).toBe('integrations.view');
    expect(WIDGET_REGISTRY.competitors.permission).toBe('competitive.view');
  });

  test('personal or composite widgets do not invent unsupported permissions', () => {
    expect(WIDGET_REGISTRY.calendar.permission).toBeUndefined();
    expect(WIDGET_REGISTRY.security.permission).toBeUndefined();
    expect(WIDGET_REGISTRY.quick.permission).toBeUndefined();
  });
});
