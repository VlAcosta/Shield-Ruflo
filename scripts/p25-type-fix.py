#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'backend/src/modules/ask-shield/ask-shield.service.ts'
text = path.read_text(encoding='utf-8')
replacements = [
    ("where: { organizationId, receivedAt: { gte: thirtyDaysAgo }, text: { not: null } },", "where: { organizationId, receivedAt: { gte: thirtyDaysAgo } },"),
    ("prisma.task.count({ where: { organizationId, dueAt: { lt: now }, status: { notIn: ['DONE', 'ARCHIVED'] } } })", "prisma.task.count({ where: { organizationId, deadline: { lt: now }, status: { notIn: ['DONE', 'ARCHIVED'] } } })"),
    ("prisma.competitiveMetricSnapshot.count({ where: { organizationId, capturedAt: { gte: thirtyDaysAgo } } })", "prisma.competitiveMetricSnapshot.count({ where: { organizationId, observedAt: { gte: thirtyDaysAgo } } })"),
    ("summary: redactPii(review.text ?? '').slice(0, 900) || null,", "summary: redactPii(review.text).text.slice(0, 900) || null,"),
]
for old, new in replacements:
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise SystemExit(f'P25 type-fix anchor not found: {old[:80]}')
path.write_text(text, encoding='utf-8')
print('P25 Ask Shield context now matches real Prisma/PII contracts')
