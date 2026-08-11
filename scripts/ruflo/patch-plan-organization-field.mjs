import fs from 'node:fs';

const path = 'backend/prisma/schema.prisma';
let text = fs.readFileSync(path, 'utf8');

const before = `model Plan {\n  id         String   @id @default(uuid()) @db.Uuid\n  code       String   @unique @db.VarChar(80)\n`;
const after = `model Plan {\n  id             String   @id @default(uuid()) @db.Uuid\n  organizationId String?  @map("organization_id") @db.Uuid\n  code           String   @unique @db.VarChar(80)\n`;

if (!text.includes('model Plan {\n  id             String   @id @default(uuid()) @db.Uuid\n  organizationId String?')) {
  if (!text.includes(before)) throw new Error('Plan field anchor not found');
  text = text.replace(before, after);
}

fs.writeFileSync(path, text);
console.log('Added Plan.organizationId field required by tenant-owned custom plans.');
