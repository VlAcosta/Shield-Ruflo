#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P22 type-fix anchor not found: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'fixed {path}')


patch('backend/src/modules/competitive/google-places-live.client.ts', '''      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': fieldMask,
        ...(init.headers ?? {}),
      },
''', '''      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
''')

patch('backend/src/modules/competitive/competitive.routes.ts', '''    const context = tenant(request);
    const { competitorId } = competitorIdParamsSchema.parse(request.params);
    return { competitor: await updateCompetitor(app, context, competitorId, updateCompetitorSchema.parse(request.body)) };
''', '''    const context = tenant(request);
    const { competitorId } = competitorIdParamsSchema.parse(request.params);
    const body = updateCompetitorSchema.parse(request.body);
    return {
      competitor: await updateCompetitor(app, context, competitorId, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.website !== undefined ? { website: body.website } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      }),
    };
''')

print('P22 strict competitive type fixes applied')
