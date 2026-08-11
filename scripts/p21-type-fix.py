#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P21 type-fix anchor not found: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'fixed {path}')


patch('backend/src/modules/acquisition/acquisition.routes.ts', '''    const query = acquisitionMetricsQuerySchema.parse(request.query);
    return acquisitionMetrics(app, context.organizationId, campaignId, query);
''', '''    const query = acquisitionMetricsQuerySchema.parse(request.query);
    return acquisitionMetrics(app, context.organizationId, campaignId, {
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
    });
''')

patch('backend/src/modules/acquisition/acquisition.routes.ts', '''    const { slug } = publicCampaignParamsSchema.parse(request.params);
    const query = publicCampaignQuerySchema.parse(request.query);
    return getPublicCampaign(app, slug, query);
''', '''    const { slug } = publicCampaignParamsSchema.parse(request.params);
    const query = publicCampaignQuerySchema.parse(request.query);
    return getPublicCampaign(app, slug, {
      ...(query.invite !== undefined ? { invite: query.invite } : {}),
      ...(query.session !== undefined ? { session: query.session } : {}),
    });
''')

patch('backend/src/modules/acquisition/acquisition.routes.ts', '''    const { slug } = publicCampaignParamsSchema.parse(request.params);
    const body = submitFeedbackSchema.parse(request.body);
    return reply.code(201).send(await submitPublicFeedback(app, slug, body));
''', '''    const { slug } = publicCampaignParamsSchema.parse(request.params);
    const body = submitFeedbackSchema.parse(request.body);
    return reply.code(201).send(await submitPublicFeedback(app, slug, {
      rating: body.rating,
      text: body.text,
      consentToContact: body.consentToContact,
      ...(body.contactName !== undefined ? { contactName: body.contactName } : {}),
      ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail } : {}),
      ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone } : {}),
      ...(body.invite !== undefined ? { invite: body.invite } : {}),
      ...(body.session !== undefined ? { session: body.session } : {}),
    }));
''')

patch('backend/src/modules/acquisition/acquisition.routes.ts', '''    const { slug, targetId } = targetClickParamsSchema.parse(request.params);
    const query = publicCampaignQuerySchema.parse(request.query);
    const result = await recordReviewTargetClick(app, slug, targetId, query);
    return reply.redirect(result.url);
''', '''    const { slug, targetId } = targetClickParamsSchema.parse(request.params);
    const query = publicCampaignQuerySchema.parse(request.query);
    const result = await recordReviewTargetClick(app, slug, targetId, {
      ...(query.invite !== undefined ? { invite: query.invite } : {}),
      ...(query.session !== undefined ? { session: query.session } : {}),
    });
    return reply.redirect(result.url);
''')

patch('backend/src/modules/acquisition/acquisition.service.ts', '''  await assertScope(app, context.organizationId, input);
''', '''  await assertScope(app, context.organizationId, {
    ...(input.businessId !== undefined ? { businessId: input.businessId } : {}),
    ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
  });
''')

patch('backend/src/modules/acquisition/acquisition.service.ts', '''        origin: 'SURVEY',
        locationIds: campaign.locationId ? [campaign.locationId] : [],
''', '''        origin: 'SURVEY',
        reviewIds: [],
        locationIds: campaign.locationId ? [campaign.locationId] : [],
''')

print('P21 strict optional type fixes applied')
