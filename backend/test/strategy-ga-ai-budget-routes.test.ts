import { describe, expect, it } from 'vitest';
import { isExpensiveAiMutation } from '../src/core/plugins/ai-request-budget.js';

describe('GA expensive AI request budget route contract', () => {
  it.each([
    ['/ask-shield/queries'],
    ['/reviews/:reviewId/ai-reply'],
    ['/reviews/:reviewId/intelligence/reanalyze'],
    ['/ai-visibility/probes/:probeId/runs'],
  ])('budgets POST %s', (path) => {
    expect(isExpensiveAiMutation('POST', path)).toBe(true);
  });

  it.each([
    ['GET', '/ask-shield/queries'],
    ['GET', '/ai-visibility/probes/:probeId/runs'],
    ['POST', '/reviews/:reviewId/reply'],
    ['POST', '/reviews/:reviewId/intelligence'],
    ['GET', '/dashboard/overview'],
  ])('does not budget %s %s', (method, path) => {
    expect(isExpensiveAiMutation(method, path)).toBe(false);
  });
});
