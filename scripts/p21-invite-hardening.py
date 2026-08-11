#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P21 invite-hardening anchor not found: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'hardened {path}')


patch('backend/src/modules/acquisition/acquisition.service.ts', '''  const campaign = await activeCampaignBySlug(app, slug);
  const invite = await resolveInvite(app, campaign.id, input.invite);
  const allowContact = campaign.collectContact && input.consentToContact;
''', '''  const campaign = await activeCampaignBySlug(app, slug);
  const invite = await resolveInvite(app, campaign.id, input.invite);
  if (invite?.status === 'CONVERTED') {
    throw new AppError({
      code: 'ACQUISITION_INVITE_ALREADY_CONVERTED',
      message: 'Обратная связь по этому приглашению уже отправлена',
      statusCode: 409,
    });
  }
  const allowContact = campaign.collectContact && input.consentToContact;
''')

patch('backend/src/modules/acquisition/acquisition.service.ts', '''    if (invite && invite.status !== 'CONVERTED') {
      await tx.reviewAcquisitionInvite.update({ where: { id: invite.id }, data: { status: 'CONVERTED', convertedAt: submittedAt } });
    }
''', '''    if (invite) {
      await tx.reviewAcquisitionInvite.update({ where: { id: invite.id }, data: { status: 'CONVERTED', convertedAt: submittedAt } });
    }
''')

patch('backend/test/p21-review-acquisition.integration.test.ts', '''    expect(feedback.statusCode).toBe(201);
    await expect(app.prisma.reviewAcquisitionInvite.findUniqueOrThrow({ where: { id: storedInvite.id } })).resolves.toMatchObject({ status: 'CONVERTED' });

    const metrics = await app.inject({
''', '''    expect(feedback.statusCode).toBe(201);
    await expect(app.prisma.reviewAcquisitionInvite.findUniqueOrThrow({ where: { id: storedInvite.id } })).resolves.toMatchObject({ status: 'CONVERTED' });

    const duplicateFeedback = await app.inject({
      method: 'POST',
      url: `/api/v1/public/review-acquisition/${campaign.publicSlug}/feedback`,
      payload: { rating: 1, text: 'Повторная отправка тем же invite', consentToContact: false, invite: inviteToken, session: 'session-metrics-duplicate' },
    });
    expect(duplicateFeedback.statusCode).toBe(409);
    expect(duplicateFeedback.json()).toMatchObject({ error: { code: 'ACQUISITION_INVITE_ALREADY_CONVERTED' } });
    expect(await app.prisma.reviewAcquisitionFeedback.count({ where: { inviteId: storedInvite.id } })).toBe(1);

    const metrics = await app.inject({
''')

print('P21 one-time invite hardening applied')
