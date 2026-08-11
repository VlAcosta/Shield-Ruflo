import fs from 'node:fs';

const path = 'backend/prisma/schema.prisma';
let text = fs.readFileSync(path, 'utf8');

const anchor = `  entitlements  Entitlement[]\n  subscriptions Subscription[]\n  payments      Payment[]\n\n  @@map("plans")\n`;
const replacement = `  organization  Organization? @relation("OrganizationPlans", fields: [organizationId], references: [id], onDelete: Cascade)\n  entitlements  Entitlement[]\n  subscriptions Subscription[]\n  payments      Payment[]\n\n  @@index([organizationId], map: "plans_organization_idx")\n  @@map("plans")\n`;

if (!text.includes('organization  Organization? @relation("OrganizationPlans"')) {
  if (!text.includes(anchor)) throw new Error('Plan relation anchor not found');
  text = text.replace(anchor, replacement);
}

fs.writeFileSync(path, text);
console.log('Added Plan -> Organization ownership relation and index metadata.');
