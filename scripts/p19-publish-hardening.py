#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P19 publish hardening anchor missing: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')

patch('backend/src/modules/reviews/review-replies.service.ts', '''  if (reply.status !== 'READY_TO_PUBLISH') {
    throw new AppError({
      code: 'REVIEW_REPLY_INVALID_TRANSITION',
      message: 'Публиковать можно только согласованный ответ',
      statusCode: 409,
    });
  }
''', '''  if (!['READY_TO_PUBLISH', 'PUBLISH_FAILED'].includes(reply.status)) {
    throw new AppError({
      code: 'REVIEW_REPLY_INVALID_TRANSITION',
      message: 'Публиковать можно только согласованный ответ или повторить подтверждённо неуспешную публикацию',
      statusCode: 409,
    });
  }
''')

patch('backend/src/worker.ts', '''  await prisma.job.update({
    where: { id: job.id },
    data: exhausted
      ? {
          status: 'DEAD',
          completedAt: new Date(),
          lastError: message.slice(0, 4000),
          lockedAt: null,
          lockToken: null,
        }
      : {
          status: 'QUEUED',
          completedAt: null,
          lastError: message.slice(0, 4000),
          lockedAt: null,
          lockToken: null,
          runAt: new Date(Date.now() + delaySeconds * 1000),
        },
  });
}
''', '''  await prisma.job.update({
    where: { id: job.id },
    data: exhausted
      ? {
          status: 'DEAD',
          completedAt: new Date(),
          lastError: message.slice(0, 4000),
          lockedAt: null,
          lockToken: null,
        }
      : {
          status: 'QUEUED',
          completedAt: null,
          lastError: message.slice(0, 4000),
          lockedAt: null,
          lockToken: null,
          runAt: new Date(Date.now() + delaySeconds * 1000),
        },
  });

  if (exhausted && job.type === 'provider.publishReply') {
    const replyId = String(job.payload?.replyId || '');
    const organizationId = String(job.payload?.organizationId || '');
    if (replyId && organizationId) {
      await prisma.reviewReply.updateMany({
        where: { id: replyId, organizationId, status: { in: ['PUBLISH_QUEUED', 'PUBLISHING'] } },
        data: { status: 'PUBLISH_FAILED', failedReason: message.slice(0, 1000) },
      });
    }
  }
}
''')

# Add an API-level retry regression before the Autopilot test.
test = ROOT / 'backend/test/p19-ai-reply-copilot.integration.test.ts'
text = test.read_text(encoding='utf-8')
anchor = "  it('never auto-publishes a one-star review even with Autopilot enabled', async () => {\n"
addition = '''  it('allows an explicitly failed publication to be queued again without faking success', async () => {
    publishMode = 'confirmed';
    const review = await createReview(5, 'retry-failed');
    const reply = await app.prisma.reviewReply.create({
      data: {
        organizationId,
        reviewId: review.id,
        authorUserId: userId,
        text: 'Спасибо за отзыв, будем рады видеть вас снова!',
        status: 'PUBLISH_FAILED',
        version: 1,
        retryCount: 1,
        failedReason: 'GOOGLE_REVIEWS_UPSTREAM_UNAVAILABLE',
      },
    });
    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${review.id}/replies/${reply.id}/publish`,
      headers: { cookie },
    });
    expect(retry.statusCode).toBe(202);
    expect(retry.json().status).toBe('PUBLISH_QUEUED');
    await expect(app.prisma.reviewReply.findUniqueOrThrow({ where: { id: reply.id } }))
      .resolves.toMatchObject({ status: 'PUBLISH_QUEUED', retryCount: 2, failedReason: null });
  });

'''
if anchor not in text:
    raise SystemExit('P19 retry regression insertion anchor missing')
test.write_text(text.replace(anchor, addition + anchor, 1), encoding='utf-8')
print('added publish retry regression')

print('P19 publish hardening applied')
