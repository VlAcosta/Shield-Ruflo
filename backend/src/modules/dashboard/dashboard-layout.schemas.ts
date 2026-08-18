import { z } from 'zod';

export const DASHBOARD_WIDGET_IDS = [
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
] as const;

const dashboardWidgetIdSchema = z.enum(DASHBOARD_WIDGET_IDS);
const dashboardWidgetConfigSchema = z.object({
  visible: z.boolean(),
  span: z.number().int().min(1).max(12),
}).strict();

const dashboardWidgetsSchema = z.record(z.string(), dashboardWidgetConfigSchema).superRefine((widgets, ctx) => {
  const allowed = new Set<string>(DASHBOARD_WIDGET_IDS);
  for (const key of Object.keys(widgets)) {
    if (!allowed.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `Unknown dashboard widget: ${key}`,
      });
    }
  }
});

export const dashboardLayoutSchema = z.object({
  version: z.number().int().min(1).max(100),
  preferences: z.object({
    density: z.enum(['comfortable', 'compact']),
  }).strict(),
  order: z.array(dashboardWidgetIdSchema).min(1).max(DASHBOARD_WIDGET_IDS.length),
  widgets: dashboardWidgetsSchema,
}).strict().superRefine((layout, ctx) => {
  if (new Set(layout.order).size !== layout.order.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['order'],
      message: 'Dashboard widget order must not contain duplicates',
    });
  }

  for (const widgetId of layout.order) {
    if (!layout.widgets[widgetId]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['widgets', widgetId],
        message: `Missing configuration for dashboard widget: ${widgetId}`,
      });
    }
  }

  const serialized = JSON.stringify(layout);
  if (Buffer.byteLength(serialized, 'utf8') > 32 * 1024) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Dashboard layout payload is too large',
    });
  }
});

export const saveDashboardLayoutSchema = z.object({
  layout: dashboardLayoutSchema,
}).strict();

export type DashboardLayoutInput = z.infer<typeof dashboardLayoutSchema>;
