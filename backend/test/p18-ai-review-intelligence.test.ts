import { describe, expect, it } from 'vitest';
import { redactPii } from '../src/modules/ai/privacy/pii-redaction.js';
import { reviewIntelligenceOutputSchema } from '../src/modules/ai/review-intelligence.schemas.js';
import { reviewInputHash } from '../src/modules/ai/review-intelligence.service.js';

describe('P18 AI review intelligence domain', () => {
  it('accepts structured output and rejects out-of-range risk values', () => {
    const base = {
      sentiment: 'NEGATIVE',
      aspects: [{ aspect: 'SPEED', sentiment: 'NEGATIVE', confidence: 0.9, evidence: 'ждали 40 минут' }],
      operationalUrgency: 75,
      reputationRisk: 62,
      churnRisk: null,
      churnRiskConfidence: null,
      churnRiskInsufficientEvidence: true,
      legalPrRisk: false,
      legalPrRiskReason: null,
      safetyRisk: false,
      safetyRiskReason: null,
      spamSignalProbability: 0.1,
      coordinatedSignalProbability: 0.05,
      signalReasons: [],
      rootCauseHypothesis: 'Возможна перегрузка смены',
      observedFacts: ['Клиент сообщил об ожидании 40 минут'],
      inferences: ['Возможна перегрузка'],
      recommendations: ['Проверить staffing'],
      confidence: 0.91,
    } as const;
    expect(reviewIntelligenceOutputSchema.safeParse(base).success).toBe(true);
    expect(reviewIntelligenceOutputSchema.safeParse({ ...base, reputationRisk: 101 }).success).toBe(false);
  });

  it('redacts common PII without mutating unrelated text', () => {
    const result = redactPii('Напишите test@example.com или +7 999 123-45-67. Сервис хороший.');
    expect(result.text).toContain('[EMAIL]');
    expect(result.text).toContain('[PHONE]');
    expect(result.text).toContain('Сервис хороший');
    expect(result.redactions.email).toBe(1);
    expect(result.redactions.phone).toBe(1);
  });

  it('produces stable hashes and changes when review content changes', () => {
    const base = {
      id: '11111111-1111-4111-8111-111111111111',
      rating: 3,
      text: 'Долго ждали',
      language: 'ru',
      publishedAt: new Date('2026-08-01T10:00:00.000Z'),
      providerUpdatedAt: new Date('2026-08-01T10:00:00.000Z'),
    };
    expect(reviewInputHash(base)).toBe(reviewInputHash({ ...base }));
    expect(reviewInputHash(base)).not.toBe(reviewInputHash({ ...base, text: 'Очень долго ждали' }));
  });
});
