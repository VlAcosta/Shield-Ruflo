import {
  MANAGED_SERVICES,
  PRICING_PLANS,
  SOFTWARE_ADDONS,
  calculatePlanTotal,
  mergeServerCatalog,
} from './pricingData';

describe('strategic pricing presentation', () => {
  test('uses the four audited SaaS tiers and exact list prices', () => {
    expect(PRICING_PLANS.map((plan) => [plan.id, plan.monthlyPrice])).toEqual([
      ['START', 3490],
      ['GROWTH', 8990],
      ['PRO', 18990],
      ['BUSINESS', 39900],
    ]);
    expect(PRICING_PLANS.find((plan) => plan.id === 'GROWTH')?.popular).toBe(true);
    expect(PRICING_PLANS.find((plan) => plan.id === 'BUSINESS')?.pricePrefix).toBe('от');
  });

  test('keeps annual discount at 15 percent and exposes ruble savings', () => {
    const growth = PRICING_PLANS.find((plan) => plan.id === 'GROWTH');
    const annual = calculatePlanTotal(growth, 'annual');
    expect(annual.subtotal).toBe(107880);
    expect(annual.billingDiscount).toBe(16182);
    expect(annual.total).toBe(91698);
  });

  test('keeps human services outside SaaS plan outcomes', () => {
    const planText = JSON.stringify(PRICING_PLANS).toLowerCase();
    expect(planText).not.toContain('3 дизайн-задач');
    expect(planText).not.toContain('все возможности без лимитов');
    expect(MANAGED_SERVICES.some((item) => item.id === 'legal')).toBe(true);
    expect(MANAGED_SERVICES.some((item) => item.id === 'content')).toBe(true);
    expect(SOFTWARE_ADDONS.some((item) => item.id === 'review-pack')).toBe(true);
  });

  test('server catalog overrides money and quota values while copy remains local', () => {
    const merged = mergeServerCatalog(PRICING_PLANS, [{
      code: 'START',
      priceCents: 350000,
      entitlements: { 'locations.max': 2, 'retention.months': 6 },
    }]);
    expect(merged[0].monthlyPrice).toBe(3500);
    expect(merged[0].limits.find(([, key]) => key === 'locations.max')?.[2]).toBe('2');
    expect(merged[0].limits.find(([, key]) => key === 'retention.months')?.[2]).toBe('6 мес.');
    expect(merged[0].description).toBe(PRICING_PLANS[0].description);
  });
});
