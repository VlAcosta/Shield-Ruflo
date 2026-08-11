import type { PrismaClient } from '../../generated/prisma/client.js';
import { redactPii } from './privacy/pii-redaction.js';
import { REPLY_POLICY_VERSION } from './reply-copilot.schemas.js';

export type ReplyPolicyDecision = 'ALLOW' | 'REQUIRE_APPROVAL' | 'BLOCK';

export type ReplyPolicyResult = {
  decision: ReplyPolicyDecision;
  policyVersion: string;
  violations: string[];
  warnings: string[];
  reasons: string[];
};

const legalAdmissionPatterns = [
  /мы\s+(?:полностью\s+)?призна[её]м\s+(?:свою\s+)?вину/i,
  /мы\s+нарушили\s+закон/i,
  /we\s+(?:fully\s+)?admit\s+(?:our\s+)?fault/i,
  /we\s+broke\s+the\s+law/i,
];

const compensationPatterns = [
  /(?:верн[её]м|возместим|компенсируем)\s+(?:вам\s+)?(?:деньги|стоимость|ущерб)/i,
  /(?:дадим|предоставим)\s+(?:вам\s+)?скидк/i,
  /(?:refund|reimburse|compensate)\s+(?:you|the)/i,
];

const unsupportedFactPatterns = [
  /мы\s+уже\s+(?:вернули|перечислили|уволили|наказали|проверили\s+камеры)/i,
  /we\s+have\s+already\s+(?:refunded|transferred|fired|reviewed\s+the\s+cameras)/i,
];

function includesPhrase(text: string, phrase: string): boolean {
  return text.toLocaleLowerCase('ru-RU').includes(phrase.toLocaleLowerCase('ru-RU'));
}

export async function evaluateReplyPolicy(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    reviewId: string;
    text: string;
    aiConfidence?: number | null;
    aiWarnings?: string[];
  },
): Promise<ReplyPolicyResult> {
  const [voice, review, insight] = await Promise.all([
    prisma.brandVoiceProfile.findUnique({ where: { organizationId: input.organizationId } }),
    prisma.review.findFirst({ where: { id: input.reviewId, organizationId: input.organizationId }, select: { rating: true } }),
    prisma.reviewInsight.findFirst({
      where: { reviewId: input.reviewId, organizationId: input.organizationId },
      orderBy: [{ analysisVersion: 'desc' }, { createdAt: 'desc' }],
      select: { reputationRisk: true, legalPrRisk: true, safetyRisk: true },
    }),
  ]);

  const violations: string[] = [];
  const warnings = [...(input.aiWarnings ?? [])];
  const reasons: string[] = [];
  const text = input.text.trim();
  const pii = redactPii(text).redactions;

  if (Object.values(pii).some((count) => count > 0)) {
    violations.push('PII_DISCLOSURE');
    reasons.push('PUBLIC_REPLY_CONTAINS_PII');
  }

  for (const phrase of voice?.prohibitedPhrases ?? []) {
    if (typeof phrase === 'string' && phrase.trim() && includesPhrase(text, phrase)) {
      violations.push('FORBIDDEN_BRAND_PHRASE');
      reasons.push('BRAND_VOICE_PROHIBITED_PHRASE');
      break;
    }
  }

  if (legalAdmissionPatterns.some((pattern) => pattern.test(text))) {
    violations.push('LEGAL_ADMISSION');
    reasons.push('LEGAL_ADMISSION_DETECTED');
  }

  const compensationPromise = compensationPatterns.some((pattern) => pattern.test(text));
  if (compensationPromise) {
    if ((voice?.compensationPolicy ?? 'REQUIRE_APPROVAL') === 'FORBID') {
      violations.push('COMPENSATION_PROMISE_FORBIDDEN');
      reasons.push('COMPENSATION_POLICY_FORBIDS_PROMISE');
    } else if ((voice?.compensationPolicy ?? 'REQUIRE_APPROVAL') === 'REQUIRE_APPROVAL') {
      warnings.push('COMPENSATION_PROMISE');
      reasons.push('COMPENSATION_PROMISE_REQUIRES_APPROVAL');
    }
  }

  if (unsupportedFactPatterns.some((pattern) => pattern.test(text))) {
    warnings.push('POSSIBLE_UNSUPPORTED_FACT');
    reasons.push('FACTUAL_CLAIM_REQUIRES_HUMAN_VERIFICATION');
  }

  if (review?.rating === 1) reasons.push('ONE_STAR_REQUIRES_APPROVAL');
  if (insight?.legalPrRisk) reasons.push('LEGAL_PR_RISK_REQUIRES_APPROVAL');
  if (insight?.safetyRisk) reasons.push('SAFETY_RISK_REQUIRES_APPROVAL');
  if (typeof input.aiConfidence === 'number' && input.aiConfidence < 0.75) reasons.push('LOW_AI_CONFIDENCE_REQUIRES_APPROVAL');

  const decision: ReplyPolicyDecision = violations.length
    ? 'BLOCK'
    : reasons.length || warnings.length
      ? 'REQUIRE_APPROVAL'
      : 'ALLOW';

  return {
    decision,
    policyVersion: REPLY_POLICY_VERSION,
    violations: [...new Set(violations)],
    warnings: [...new Set(warnings)],
    reasons: [...new Set(reasons)],
  };
}
