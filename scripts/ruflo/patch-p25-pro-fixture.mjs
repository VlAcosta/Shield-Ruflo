import fs from 'node:fs';

const path = 'backend/test/p25-ask-shield.integration.test.ts';
let text = fs.readFileSync(path, 'utf8');

const importLine = "import { provisionTestPlan } from './support/plan-fixtures.js';";
if (!text.includes(importLine)) {
  const anchor = "import { hashSessionToken } from '../src/shared/security/tokens.js';";
  if (!text.includes(anchor)) throw new Error('P25 import anchor not found');
  text = text.replace(anchor, `${anchor}\n${importLine}`);
}

const fixture = "    await provisionTestPlan(app, [organizationId, otherOrganizationId], 'PRO');\n";
if (!text.includes(fixture.trim())) {
  const marker = '    await app.prisma.user.createMany({ data: [';
  if (!text.includes(marker)) throw new Error('P25 fixture marker not found');
  text = text.replace(marker, `${fixture}${marker}`);
}

fs.writeFileSync(path, text);
console.log('Patched P25 Ask Shield with explicit PRO plan fixture.');
