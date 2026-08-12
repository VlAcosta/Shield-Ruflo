import { z } from 'zod';

export const constructorModules = [
  'reviews',
  'acquisition',
  'analytics',
  'automations',
  'ai',
  'competitive',
  'integrations',
] as const;

export type ConstructorModule = (typeof constructorModules)[number];

export const constructorSelectionSchema = z.object({
  businesses: z.coerce.number().int().min(1).max(50),
  locations: z.coerce.number().int().min(1).max(250),
  users: z.coerce.number().int().min(1).max(100),
  modules: z.array(z.enum(constructorModules)).min(1).max(constructorModules.length)
    .transform((items) => [...new Set(items)]),
});

export type ConstructorSelection = z.infer<typeof constructorSelectionSchema>;

const BASE_PRICE_CENTS = 149_000;
const EXTRA_BUSINESS_CENTS = 149_000;
const EXTRA_LOCATION_CENTS = 25_000;
const EXTRA_USER_CENTS = 19_000;

const moduleCatalog: Readonly<Record<ConstructorModule, { label: string; priceCents: number }>> = Object.freeze({
  reviews: { label: 'Работа с отзывами', priceCents: 0 },
  acquisition: { label: 'Сбор отзывов', priceCents: 69_000 },
  analytics: { label: 'Аналитика и отчёты', priceCents: 99_000 },
  automations: { label: 'Автоматизации', priceCents: 129_000 },
  ai: { label: 'AI-инструменты', priceCents: 149_000 },
  competitive: { label: 'Конкуренты', priceCents: 99_000 },
  integrations: { label: 'Интеграции и API', priceCents: 99_000 },
});

export function quoteConstructor(selectionInput: unknown) {
  const selection = constructorSelectionSchema.parse(selectionInput);
  const selected = new Set(selection.modules);
  selected.add('reviews');

  const moduleLines = [...selected].map((module) => ({
    key: `module:${module}`,
    label: moduleCatalog[module].label,
    quantity: 1,
    unitPriceCents: moduleCatalog[module].priceCents,
    totalCents: moduleCatalog[module].priceCents,
  }));

  const volumeLines = [
    {
      key: 'volume:businesses',
      label: 'Дополнительные компании',
      quantity: Math.max(0, selection.businesses - 1),
      unitPriceCents: EXTRA_BUSINESS_CENTS,
    },
    {
      key: 'volume:locations',
      label: 'Дополнительные локации',
      quantity: Math.max(0, selection.locations - 1),
      unitPriceCents: EXTRA_LOCATION_CENTS,
    },
    {
      key: 'volume:users',
      label: 'Дополнительные пользователи',
      quantity: Math.max(0, selection.users - 1),
      unitPriceCents: EXTRA_USER_CENTS,
    },
  ].filter((line) => line.quantity > 0)
    .map((line) => ({ ...line, totalCents: line.quantity * line.unitPriceCents }));

  const lines = [
    { key: 'base', label: 'Бизнес Щит · базовое рабочее пространство', quantity: 1, unitPriceCents: BASE_PRICE_CENTS, totalCents: BASE_PRICE_CENTS },
    ...moduleLines.filter((line) => line.totalCents > 0),
    ...volumeLines,
  ];
  const amountCents = lines.reduce((sum, line) => sum + line.totalCents, 0);

  return {
    currency: 'RUB' as const,
    amountCents,
    amount: Number((amountCents / 100).toFixed(2)),
    selection: { ...selection, modules: [...selected] as ConstructorModule[] },
    lines,
    entitlements: {
      maxBusinesses: selection.businesses,
      maxLocations: selection.locations,
      maxUsers: selection.users,
      maxReviewSources: Math.max(5, selection.locations * 5),
      analytics: selected.has('analytics'),
      reports: selected.has('analytics'),
      automations: selected.has('automations'),
      acquisition: selected.has('acquisition'),
      competitive: selected.has('competitive'),
      aiVisibility: selected.has('ai'),
      aiFeatures: selected.has('ai'),
      integrations: selected.has('integrations'),
      apiAccess: selected.has('integrations'),
    },
  };
}
