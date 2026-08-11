import fs from 'node:fs';

function patchFile(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (before === after) {
    console.log(`No change: ${path}`);
    return false;
  }
  fs.writeFileSync(path, after);
  console.log(`Patched: ${path}`);
  return true;
}

function ensureImport(text) {
  const statement = "import { provisionTestPlan } from './support/plan-fixtures.js';";
  if (text.includes(statement)) return text;
  const anchor = "import { hashSessionToken } from '../src/shared/security/tokens.js';";
  if (!text.includes(anchor)) throw new Error(`Import anchor not found`);
  return text.replace(anchor, `${anchor}\n${statement}`);
}

function ensureProFixture(text, marker, ids) {
  text = ensureImport(text);
  const statement = `    await provisionTestPlan(app, [${ids.join(', ')}], 'PRO');\n`;
  if (text.includes(statement.trim())) return text;
  if (!text.includes(marker)) throw new Error(`Fixture marker not found`);
  return text.replace(marker, `${statement}${marker}`);
}

patchFile('backend/test/p22-competitive-intelligence.integration.test.ts', (text) => ensureProFixture(
  text,
  '    await app.prisma.user.createMany({',
  ['organizationId', 'otherOrganizationId'],
));

patchFile('backend/test/operations-p10.integration.test.ts', (text) => ensureProFixture(
  text,
  '    await app.prisma.user.createMany({',
  ['organizationAId', 'organizationBId'],
));

patchFile('backend/test/dashboard-p6.integration.test.ts', (text) => ensureProFixture(
  text,
  '    await app.prisma.user.createMany({',
  ['organizationAId', 'organizationBId'],
));

patchFile('backend/test/p18-ai-review-intelligence.integration.test.ts', (text) => {
  if (text.includes("key: 'aiFeatures'")) return text;
  const oldLine = "    await app.prisma.entitlement.create({ data: { planId: plan.id, key: 'ai.review_intelligence', value: true } });";
  if (!text.includes(oldLine)) throw new Error('P18 entitlement anchor not found');
  return text.replace(oldLine, `    await app.prisma.entitlement.createMany({\n      data: [\n        { planId: plan.id, key: 'ai.review_intelligence', value: true },\n        { planId: plan.id, key: 'aiFeatures', value: true },\n      ],\n    });`);
});

patchFile('backend/test/p19-ai-reply-copilot.integration.test.ts', (text) => {
  if (text.includes("key: 'aiFeatures'")) return text;
  const anchor = "      data: [\n        { planId: plan.id, key: 'ai.review_intelligence', value: true },";
  if (!text.includes(anchor)) throw new Error('P19 entitlement anchor not found');
  return text.replace(anchor, "      data: [\n        { planId: plan.id, key: 'aiFeatures', value: true },\n        { planId: plan.id, key: 'ai.review_intelligence', value: true },");
});
