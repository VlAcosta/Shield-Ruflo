#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'backend/src/modules/listings/listing-health.service.ts'
text = path.read_text(encoding='utf-8')
old = """      listingSources: {\n        where: input.status ? { status: input.status } : undefined,\n        include: { snapshots: { orderBy: { observedAt: 'desc' }, take: 1, include: { issues: true } } },\n      },"""
new = """      listingSources: {\n        ...(input.status ? { where: { status: input.status } } : {}),\n        include: { snapshots: { orderBy: { observedAt: 'desc' }, take: 1, include: { issues: true } } },\n      },"""
if old not in text:
    if new in text:
        print('P24 exact optional include already fixed')
    else:
        raise SystemExit('P24 listingSources include anchor not found')
else:
    text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')
    print('P24 listingSources include now omits absent where')
