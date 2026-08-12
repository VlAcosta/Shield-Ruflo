import {
  CORE_CAPABILITIES,
  ICP_SEGMENTS,
  LANDING_PLAN_SUMMARY,
  PRODUCT_KPIS,
  PRODUCT_TRUTHS,
  REPUTATION_LOOP,
  STRATEGY_STATS,
} from './landingStrategyData';

function allStrategyCopy() {
  return JSON.stringify({
    CORE_CAPABILITIES,
    ICP_SEGMENTS,
    LANDING_PLAN_SUMMARY,
    PRODUCT_KPIS,
    PRODUCT_TRUTHS,
    REPUTATION_LOOP,
    STRATEGY_STATS,
  }).toLowerCase();
}

describe('evidence-safe strategic landing contract', () => {
  test('uses the seven-step closed-loop reputation workflow', () => {
    expect(REPUTATION_LOOP.map((item) => item.title)).toEqual([
      'Detect', 'Prioritize', 'Assist', 'Govern', 'Escalate', 'Operate', 'Measure',
    ]);
  });

  test('focuses GTM on three initial segments rather than an undifferentiated industry cloud', () => {
    expect(ICP_SEGMENTS.map((item) => item.id)).toEqual(['local', 'network', 'marketplace']);
  });

  test('keeps the public four-tier price ladder aligned with the audit', () => {
    expect(LANDING_PLAN_SUMMARY.map((item) => [item.id, item.price])).toEqual([
      ['START', '3 490 ₽'],
      ['GROWTH', '8 990 ₽'],
      ['PRO', '18 990 ₽'],
      ['BUSINESS', 'от 39 900 ₽'],
    ]);
  });

  test('does not contain unsupported historical marketing claims', () => {
    const copy = allStrategyCopy();
    for (const forbidden of ['98%', '350%', '500+ клиент', '10k+', '24 площадк', '38 человек', 'рост рейтинга с 3.2 до 4.9']) {
      expect(copy).not.toContain(forbidden);
    }
  });

  test('keeps managed human work outside the core platform capability list', () => {
    const capabilityCopy = JSON.stringify(CORE_CAPABILITIES).toLowerCase();
    expect(capabilityCopy).not.toContain('дизайн');
    expect(capabilityCopy).not.toContain('контент');
    expect(capabilityCopy).not.toContain('курсы');
    expect(capabilityCopy).not.toContain('персональный менеджер');
  });
});
