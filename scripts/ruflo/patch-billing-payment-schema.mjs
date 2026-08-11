import fs from 'node:fs';

const path = 'backend/prisma/schema.prisma';
let text = fs.readFileSync(path, 'utf8');

const subscriptionEnum = `enum SubscriptionStatus {\n  TRIALING\n  ACTIVE\n  PAST_DUE\n  CANCELED\n  EXPIRED\n  INCOMPLETE\n\n  @@map("subscription_status")\n}\n`;
const paymentEnums = `${subscriptionEnum}\nenum PaymentStatus {\n  CREATED\n  PENDING\n  SUCCEEDED\n  CANCELED\n  FAILED\n\n  @@map("payment_status")\n}\n\nenum BillingCheckoutKind {\n  PLAN\n  CONSTRUCTOR\n\n  @@map("billing_checkout_kind")\n}\n`;
if (!text.includes('enum PaymentStatus {')) {
  if (!text.includes(subscriptionEnum)) throw new Error('SubscriptionStatus enum anchor not found');
  text = text.replace(subscriptionEnum, paymentEnums);
}

const orgAnchor = `  subscriptions          Subscription[]\n  usageRecords           Usage[]\n`;
if (!text.includes('payments               Payment[]')) {
  if (!text.includes(orgAnchor)) throw new Error('Organization billing relation anchor not found');
  text = text.replace(orgAnchor, `  subscriptions          Subscription[]\n  payments               Payment[]\n  usageRecords           Usage[]\n`);
}

const planAnchor = `  entitlements Entitlement[]\n  subscriptions Subscription[]\n`;
if (!text.includes('  payments      Payment[]\n')) {
  if (!text.includes(planAnchor)) throw new Error('Plan relation anchor not found');
  text = text.replace(planAnchor, `  entitlements  Entitlement[]\n  subscriptions Subscription[]\n  payments      Payment[]\n`);
}

const subscriptionRelations = `  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  plan         Plan         @relation(fields: [planId], references: [id], onDelete: Restrict)\n`;
if (!text.includes('  payments     Payment[]\n')) {
  if (!text.includes(subscriptionRelations)) throw new Error('Subscription relation anchor not found');
  text = text.replace(subscriptionRelations, `${subscriptionRelations}  payments     Payment[]\n`);
}

const usageAnchor = `model Usage {\n`;
const paymentModels = `model Payment {\n  id                String              @id @default(uuid()) @db.Uuid\n  organizationId    String              @map("organization_id") @db.Uuid\n  subscriptionId    String?             @map("subscription_id") @db.Uuid\n  planId            String?             @map("plan_id") @db.Uuid\n  provider          String              @db.VarChar(80)\n  providerPaymentId String?             @map("provider_payment_id") @db.VarChar(240)\n  idempotencyKey    String              @unique @map("idempotency_key") @db.VarChar(160)\n  checkoutKind      BillingCheckoutKind @map("checkout_kind")\n  status            PaymentStatus       @default(CREATED)\n  providerStatus    String?             @map("provider_status") @db.VarChar(80)\n  amountCents       Int                 @map("amount_cents")\n  currency          String              @default("RUB") @db.VarChar(3)\n  description       String              @db.VarChar(240)\n  confirmationUrl   String?             @map("confirmation_url") @db.Text\n  test              Boolean             @default(false)\n  checkoutPayload   Json?               @map("checkout_payload")\n  providerMetadata  Json?               @map("provider_metadata")\n  paidAt            DateTime?           @map("paid_at")\n  canceledAt        DateTime?           @map("canceled_at")\n  createdAt         DateTime            @default(now()) @map("created_at")\n  updatedAt         DateTime            @updatedAt @map("updated_at")\n\n  organization Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  subscription Subscription? @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)\n  plan         Plan?         @relation(fields: [planId], references: [id], onDelete: SetNull)\n\n  @@unique([provider, providerPaymentId], map: "payments_provider_external_key")\n  @@index([organizationId, createdAt], map: "payments_org_created_idx")\n  @@index([organizationId, status, createdAt], map: "payments_org_status_created_idx")\n  @@map("payments")\n}\n\nmodel BillingWebhookEvent {\n  id               String   @id @default(uuid()) @db.Uuid\n  provider         String   @db.VarChar(80)\n  eventKey         String   @unique @map("event_key") @db.VarChar(160)\n  eventType        String   @map("event_type") @db.VarChar(120)\n  providerObjectId String   @map("provider_object_id") @db.VarChar(240)\n  payload          Json\n  receivedAt       DateTime @default(now()) @map("received_at")\n  processedAt      DateTime? @map("processed_at")\n  errorCode        String?  @map("error_code") @db.VarChar(120)\n\n  @@index([provider, providerObjectId], map: "billing_webhook_provider_object_idx")\n  @@map("billing_webhook_events")\n}\n\n${usageAnchor}`;
if (!text.includes('model Payment {')) {
  if (!text.includes(usageAnchor)) throw new Error('Usage model anchor not found');
  text = text.replace(usageAnchor, paymentModels);
}

fs.writeFileSync(path, text);
console.log('Patched Payment and BillingWebhookEvent Prisma models.');
