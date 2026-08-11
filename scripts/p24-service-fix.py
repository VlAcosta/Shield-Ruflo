#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'backend/src/modules/listings/listing-health.service.ts'
text = path.read_text(encoding='utf-8')
text = text.replace("import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';", "import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';", 1)

start = text.find('export function calculateLocationHealth(')
end = text.find('\nasync function tenantLocation', start)
if start < 0 or end < 0:
    raise SystemExit('calculateLocationHealth markers not found')
replacement = r'''export function calculateLocationHealth(location: any, observed: ProviderLocationProfileRecord, now = new Date()) {
  const canonical = canonicalProfile(location);
  const provider = {
    name: observed.title ?? null,
    address: observed.address ?? null,
    phone: observed.phone ?? null,
    website: observed.website ?? null,
    regularHours: observed.regularHours ?? null,
    categories: observed.categories ?? null,
    attributes: observed.attributes ?? null,
    images: observed.images ?? null,
  };
  const covered = new Set(observed.coveredFields);
  const issues: HealthIssue[] = [];
  let earnedWeight = 0;
  let measuredWeight = FIELD_WEIGHTS.freshness;

  for (const field of ['name', 'address', 'phone', 'website', 'regularHours', 'categories', 'images'] as const) {
    if (!covered.has(field)) continue;
    const weight = FIELD_WEIGHTS[field];
    measuredWeight += weight;
    const expected = canonical[field];
    const actual = provider[field];
    if (expected === null || expected === undefined || comparableJson(expected) === '') {
      issues.push(issue({ type: 'MISSING', severity: field === 'name' || field === 'address' ? 'CRITICAL' : 'WARNING', field, expected: null, observed: actual === null || actual === undefined ? null : json(actual), explanation: `Каноническое поле ${field} не заполнено в Business Shield; согласованность нельзя подтвердить.` }));
      continue;
    }
    if (actual === null || actual === undefined || comparableJson(actual) === '') {
      issues.push(issue({ type: 'MISSING', severity: field === 'name' || field === 'address' || field === 'phone' ? 'CRITICAL' : 'WARNING', field, expected: json(expected), observed: null, explanation: `Во внешнем listing отсутствует поле ${field}, которое заполнено в каноническом профиле.` }));
      continue;
    }
    if (comparableJson(expected) !== comparableJson(actual)) {
      issues.push(issue({ type: 'MISMATCH', severity: field === 'name' || field === 'address' || field === 'phone' ? 'CRITICAL' : 'WARNING', field, expected: json(expected), observed: json(actual), explanation: `Значение ${field} во внешнем listing отличается от канонического профиля.` }));
      continue;
    }
    earnedWeight += weight;
  }

  const freshnessDate = observed.providerUpdatedAt ?? observed.observedAt ?? now;
  const ageMs = Math.max(0, now.getTime() - freshnessDate.getTime());
  if (ageMs > STALE_AFTER_MS) {
    issues.push(issue({ type: 'STALE', severity: 'WARNING', field: 'freshness', expected: json('<=30d'), observed: json(`${Math.floor(ageMs / 86_400_000)}d`), explanation: 'Последнее подтверждённое обновление listing старше 30 дней.' }));
  } else {
    earnedWeight += FIELD_WEIGHTS.freshness;
  }

  const score = measuredWeight > 0 ? Math.round((earnedWeight / measuredWeight) * 100) : 0;
  const allProfileFields = ['name', 'address', 'phone', 'website', 'regularHours', 'categories', 'attributes', 'images'] as const;
  return {
    score: Math.max(0, Math.min(100, score)),
    scoreVersion: LISTING_HEALTH_SCORE_VERSION,
    canonical,
    provider,
    measuredFields: allProfileFields.filter((field) => covered.has(field)),
    unmeasuredFields: allProfileFields.filter((field) => !covered.has(field)),
    measuredWeight,
    issues,
  };
}
'''
text = text[:start] + replacement + text[end:]

text = text.replace("{ regularHours: input.regularHours === null ? null : json(input.regularHours) }", "{ regularHours: input.regularHours === null ? Prisma.DbNull : json(input.regularHours) }", 1)
text = text.replace("{ categories: input.categories === null ? null : json(input.categories) }", "{ categories: input.categories === null ? Prisma.DbNull : json(input.categories) }", 1)
text = text.replace("{ attributes: input.attributes === null ? null : json(input.attributes) }", "{ attributes: input.attributes === null ? Prisma.DbNull : json(input.attributes) }", 1)
text = text.replace("{ images: input.images === null ? null : json(input.images) }", "{ images: input.images === null ? Prisma.DbNull : json(input.images) }", 1)

old_snapshot = "data: { organizationId: input.organizationId, locationId: source.locationId, sourceId: source.id, observedAt: record.observedAt ?? new Date(), providerUpdatedAt: record.providerUpdatedAt ?? null, normalized: json(measurement.provider), raw: record.raw ? json(record.raw) : undefined, healthScore: measurement.score, scoreVersion: measurement.scoreVersion },"
new_snapshot = "data: { organizationId: input.organizationId, locationId: source.locationId, sourceId: source.id, observedAt: record.observedAt ?? new Date(), providerUpdatedAt: record.providerUpdatedAt ?? null, normalized: json({ ...measurement.provider, coveredFields: record.coveredFields, measuredFields: measurement.measuredFields, unmeasuredFields: measurement.unmeasuredFields }), ...(record.raw ? { raw: json(record.raw) } : {}), healthScore: measurement.score, scoreVersion: measurement.scoreVersion },"
if old_snapshot not in text:
    raise SystemExit('snapshot create anchor not found')
text = text.replace(old_snapshot, new_snapshot, 1)

old_issues = "await tx.listingHealthIssue.createMany({ data: measurement.issues.map((item) => ({ organizationId: input.organizationId, locationId: source.locationId, snapshotId: snapshot.id, type: item.type, severity: item.severity, field: item.field, expected: item.expected === null ? undefined : item.expected, observed: item.observed === null ? undefined : item.observed, explanation: item.explanation })) });"
new_issues = "await tx.listingHealthIssue.createMany({ data: measurement.issues.map((item) => ({ organizationId: input.organizationId, locationId: source.locationId, snapshotId: snapshot.id, type: item.type, severity: item.severity, field: item.field, ...(item.expected !== null ? { expected: item.expected } : {}), ...(item.observed !== null ? { observed: item.observed } : {}), explanation: item.explanation })) });"
if old_issues not in text:
    raise SystemExit('issue createMany anchor not found')
text = text.replace(old_issues, new_issues, 1)

path.write_text(text, encoding='utf-8')
print('P24 listing health coverage and Prisma JSON semantics normalized')
