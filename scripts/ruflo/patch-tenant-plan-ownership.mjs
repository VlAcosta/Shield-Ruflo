import fs from 'node:fs';

const schemaPath = 'backend/prisma/schema.prisma';
let schema = fs.readFileSync(schemaPath, 'utf8');

const orgAnchor = '  subscriptions          Subscription[]\n  payments               Payment[]\n  usageRecords           Usage[]\n';
if (!schema.includes('customPlans             Plan[]')) {
  if (!schema.includes(orgAnchor)) throw new Error('Organization plan relation anchor not found');
  schema = schema.replace(orgAnchor, '  subscriptions          Subscription[]\n  customPlans             Plan[] @relation("OrganizationPlans")\n  payments               Payment[]\n  usageRecords           Usage[]\n');
}

const planFieldsAnchor = 'model Plan {\n  id         String   @id @default(uuid()) @db.Uuid\n  code       String   @unique @db.VarChar(80)\n';
if (!schema.includes('organizationId String?')) {
  if (!schema.includes(planFieldsAnchor)) throw new Error('Plan field anchor not found');
  schema = schema.replace(planFieldsAnchor, 'model Plan {\n  id             String   @id @default(uuid()) @db.Uuid\n  organizationId String?  @map("organization_id") @db.Uuid\n  code           String   @unique @db.VarChar(80)\n');
}

const planRelationsAnchor = '  entitlements  Entitlement[]\n  subscriptions Subscription[]\n  payments      Payment[]\n\n  @@map("plans")\n';
if (!schema.includes('@relation("OrganizationPlans"')) {
  if (!schema.includes(planRelationsAnchor)) throw new Error('Plan relation anchor not found');
  schema = schema.replace(planRelationsAnchor, '  organization  Organization? @relation("OrganizationPlans", fields: [organizationId], references: [id], onDelete: Cascade)\n  entitlements  Entitlement[]\n  subscriptions Subscription[]\n  payments      Payment[]\n\n  @@index([organizationId], map: "plans_organization_idx")\n  @@map("plans")\n');
}

fs.writeFileSync(schemaPath, schema);

const checkoutPath = 'backend/src/modules/billing/billing.checkout.ts';
let checkout = fs.readFileSync(checkoutPath, 'utf8');
const createAnchor = "      code: customPlanCode(organizationId),\n      name: 'Индивидуальный',";
if (!checkout.includes('      organizationId,\n      code: customPlanCode(organizationId),')) {
  if (!checkout.includes(createAnchor)) throw new Error('Custom plan create anchor not found');
  checkout = checkout.replace(createAnchor, "      organizationId,\n      code: customPlanCode(organizationId),\n      name: 'Индивидуальный',");
}
const updateAnchor = "    update: {\n      name: 'Индивидуальный',";
if (!checkout.includes("    update: {\n      organizationId,")) {
  if (!checkout.includes(updateAnchor)) throw new Error('Custom plan update anchor not found');
  checkout = checkout.replace(updateAnchor, "    update: {\n      organizationId,\n      name: 'Индивидуальный',");
}
fs.writeFileSync(checkoutPath, checkout);

console.log('Tenant ownership added to custom billing plans.');
