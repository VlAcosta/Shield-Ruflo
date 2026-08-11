#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P20 AI-draft patch anchor not found: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')


patch('backend/src/modules/operations/automation-engine.ts', "import { createCaseFromReview } from '../cases/cases.service.js';\n", "import { createCaseFromReview } from '../cases/cases.service.js';\nimport { enqueueAiReplyGeneration } from '../ai/reply-copilot.service.js';\n")

patch('backend/src/modules/operations/automation-engine.ts', '''  if (action.type === 'create_task' && review) {
''', '''  if ((action.type === 'create_ai_reply_draft' || action.type === 'generate_ai_reply') && review) {
    if (!actorUserId) return { type: action.type, skipped: 'NO_ACTIVE_MEMBER' };
    const requestedMode = typeof action.config.mode === 'string' ? action.config.mode.toUpperCase() : 'RECOVERY_FOCUSED';
    const mode = ['CONCISE', 'EMPATHETIC', 'FORMAL', 'RECOVERY_FOCUSED'].includes(requestedMode)
      ? requestedMode as 'CONCISE' | 'EMPATHETIC' | 'FORMAL' | 'RECOVERY_FOCUSED'
      : 'RECOVERY_FOCUSED';
    const instructions = typeof action.config.instructions === 'string'
      ? action.config.instructions.slice(0, 4000)
      : `Автоматизация «${automation.name}». Подготовить безопасный черновик ответа для дальнейшего согласования.`;
    try {
      const queued = await enqueueAiReplyGeneration(app.prisma, {
        organizationId: event.organizationId,
        reviewId: review.id,
        actorUserId,
        mode,
        instructions,
      });
      return { type: action.type, operationId: queued.operationId, jobId: queued.jobId, status: queued.status };
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (['ENTITLEMENT_REQUIRED', 'AI_PROVIDER_UNAVAILABLE', 'REVIEW_INTELLIGENCE_REQUIRED'].includes(code)) {
        return { type: action.type, skipped: code };
      }
      throw error;
    }
  }

  if (action.type === 'create_task' && review) {
''')

patch('backend/test/p20-reputation-cases.integration.test.ts', '''          { type: 'create_case', config: { category: 'service-speed', severity: 'HIGH', slaMinutes: 240 } },
          { type: 'create_task', config: { title: 'Разобрать повторяющийся негатив' } },
''', '''          { type: 'create_case', config: { category: 'service-speed', severity: 'HIGH', slaMinutes: 240 } },
          { type: 'create_ai_reply_draft', config: { mode: 'RECOVERY_FOCUSED' } },
          { type: 'create_task', config: { title: 'Разобрать повторяющийся негатив' } },
''')
patch('backend/test/p20-reputation-cases.integration.test.ts', '''    expect(first[0]).toMatchObject({ automationId: automation.id, status: 'SUCCESS' });

    const caseRow = await app.prisma.reputationCase.findFirstOrThrow({
''', '''    expect(first[0]).toMatchObject({ automationId: automation.id, status: 'SUCCESS' });
    const effects = first[0]?.effects as Array<Record<string, unknown>>;
    expect(effects.some((effect) => effect.type === 'create_ai_reply_draft')).toBe(true);
    expect(effects.find((effect) => effect.type === 'create_ai_reply_draft')).toMatchObject({ skipped: 'ENTITLEMENT_REQUIRED' });

    const caseRow = await app.prisma.reputationCase.findFirstOrThrow({
''')

print('P20 durable AI reply draft automation patch applied')
