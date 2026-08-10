import {
  DEFAULT_WIDGET_ORDER,
  WIDGET_REGISTRY,
  createDefaultDashboardLayout,
  normalizeDashboardLayout,
} from './widgetRegistry';

describe('dashboard widget registry', () => {
  test('default layout contains the current registered Business Shield widgets', () => {
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
          visible: true,
        }),
      );
    });
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
});
