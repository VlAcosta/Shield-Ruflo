#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P21 patch anchor not found: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')


schema = 'backend/prisma/schema.prisma'
patch(schema, '''enum ReputationCaseMetricPhase {
  BASELINE
  RESOLUTION
  VERIFICATION

  @@map("reputation_case_metric_phase")
}
''', '''enum ReputationCaseMetricPhase {
  BASELINE
  RESOLUTION
  VERIFICATION

  @@map("reputation_case_metric_phase")
}

enum AcquisitionCampaignStatus {
  DRAFT
  ACTIVE
  PAUSED
  ARCHIVED

  @@map("acquisition_campaign_status")
}

enum AcquisitionChannel {
  QR
  LINK
  EMAIL
  SMS
  WHATSAPP
  OTHER

  @@map("acquisition_channel")
}

enum AcquisitionEventType {
  VIEW
  FEEDBACK_SUBMITTED
  REVIEW_TARGET_CLICK
  INVITE_OPENED

  @@map("acquisition_event_type")
}

enum AcquisitionFeedbackStatus {
  NEW
  ACKNOWLEDGED
  CASE_OPENED
  ARCHIVED

  @@map("acquisition_feedback_status")
}

enum AcquisitionInviteStatus {
  CREATED
  OPENED
  CONVERTED
  EXPIRED
  REVOKED

  @@map("acquisition_invite_status")
}
''')

patch(schema, '''  createdReputationCases     ReputationCase[]      @relation("ReputationCaseCreator")
  reputationCaseActivities   ReputationCaseActivity[] @relation("ReputationCaseActivityActor")
  notifications              Notification[]        @relation("NotificationUser")
''', '''  createdReputationCases     ReputationCase[]      @relation("ReputationCaseCreator")
  reputationCaseActivities   ReputationCaseActivity[] @relation("ReputationCaseActivityActor")
  createdAcquisitionCampaigns ReviewAcquisitionCampaign[] @relation("AcquisitionCampaignCreator")
  createdAcquisitionInvites   ReviewAcquisitionInvite[] @relation("AcquisitionInviteCreator")
  notifications              Notification[]        @relation("NotificationUser")
''')

patch(schema, '''  reputationCases        ReputationCase[]
  reputationCaseActivities ReputationCaseActivity[]
  reputationCaseMetricSnapshots ReputationCaseMetricSnapshot[]
  subscriptions          Subscription[]
''', '''  reputationCases        ReputationCase[]
  reputationCaseActivities ReputationCaseActivity[]
  reputationCaseMetricSnapshots ReputationCaseMetricSnapshot[]
  acquisitionCampaigns    ReviewAcquisitionCampaign[]
  acquisitionFeedback     ReviewAcquisitionFeedback[]
  acquisitionInvites      ReviewAcquisitionInvite[]
  acquisitionEvents       ReviewAcquisitionEvent[]
  subscriptions          Subscription[]
''')

patch(schema, '''  reviewSources ReviewSource[]
  reviews       Review[]
  tasks         Task[]

  @@index([organizationId, status], map: "businesses_org_status_idx")
''', '''  reviewSources ReviewSource[]
  reviews       Review[]
  tasks         Task[]
  acquisitionCampaigns ReviewAcquisitionCampaign[]

  @@index([organizationId, status], map: "businesses_org_status_idx")
''')

patch(schema, '''  reviews       Review[]
  tasks         Task[]
  reputationCases ReputationCaseLocation[]

  @@index([businessId, status], map: "locations_business_status_idx")
''', '''  reviews       Review[]
  tasks         Task[]
  reputationCases ReputationCaseLocation[]
  acquisitionCampaigns ReviewAcquisitionCampaign[]
  acquisitionFeedback ReviewAcquisitionFeedback[]

  @@index([businessId, status], map: "locations_business_status_idx")
''')

patch(schema, '''  metricSnapshots ReputationCaseMetricSnapshot[]

  @@unique([organizationId, sourceDedupeKey], map: "reputation_cases_org_source_dedupe_key")
''', '''  metricSnapshots ReputationCaseMetricSnapshot[]
  acquisitionFeedback ReviewAcquisitionFeedback[]

  @@unique([organizationId, sourceDedupeKey], map: "reputation_cases_org_source_dedupe_key")
''')

patch(schema, '''model Task {
''', '''model ReviewAcquisitionCampaign {
  id                String                    @id @default(uuid()) @db.Uuid
  organizationId    String                    @map("organization_id") @db.Uuid
  businessId        String?                   @map("business_id") @db.Uuid
  locationId        String?                   @map("location_id") @db.Uuid
  name              String                    @db.VarChar(180)
  status            AcquisitionCampaignStatus @default(DRAFT)
  channel           AcquisitionChannel        @default(QR)
  publicSlug        String                    @unique @map("public_slug") @db.VarChar(96)
  headline          String                    @default("Расскажите о вашем опыте") @db.VarChar(240)
  description       String                    @default("") @db.Text
  thankYouMessage   String                    @default("Спасибо за обратную связь!") @map("thank_you_message") @db.VarChar(500)
  collectContact    Boolean                   @default(false) @map("collect_contact")
  caseBelowRating   Int?                      @map("case_below_rating")
  createdByUserId   String?                   @map("created_by_user_id") @db.Uuid
  createdAt         DateTime                  @default(now()) @map("created_at")
  updatedAt         DateTime                  @updatedAt @map("updated_at")
  archivedAt        DateTime?                 @map("archived_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  business     Business?     @relation(fields: [businessId], references: [id], onDelete: SetNull)
  location     Location?     @relation(fields: [locationId], references: [id], onDelete: SetNull)
  createdBy    User?         @relation("AcquisitionCampaignCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)
  targets      ReviewAcquisitionTarget[]
  feedback     ReviewAcquisitionFeedback[]
  invites      ReviewAcquisitionInvite[]
  events       ReviewAcquisitionEvent[]

  @@index([organizationId, status, createdAt], map: "review_acquisition_campaigns_org_status_idx")
  @@index([locationId, status], map: "review_acquisition_campaigns_location_status_idx")
  @@map("review_acquisition_campaigns")
}

model ReviewAcquisitionTarget {
  id         String   @id @default(uuid()) @db.Uuid
  campaignId String   @map("campaign_id") @db.Uuid
  provider   String   @db.VarChar(80)
  label      String   @db.VarChar(120)
  url        String   @db.Text
  priority   Int      @default(100)
  enabled    Boolean  @default(true)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  campaign ReviewAcquisitionCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  events   ReviewAcquisitionEvent[]

  @@index([campaignId, enabled, priority], map: "review_acquisition_targets_campaign_enabled_idx")
  @@map("review_acquisition_targets")
}

model ReviewAcquisitionInvite {
  id                String                   @id @default(uuid()) @db.Uuid
  organizationId    String                   @map("organization_id") @db.Uuid
  campaignId        String                   @map("campaign_id") @db.Uuid
  channel           AcquisitionChannel       @default(LINK)
  tokenHash         String                   @unique @map("token_hash") @db.VarChar(128)
  tokenHint         String                   @map("token_hint") @db.VarChar(16)
  status            AcquisitionInviteStatus  @default(CREATED)
  externalReference String?                  @map("external_reference") @db.VarChar(240)
  expiresAt         DateTime                 @map("expires_at")
  openedAt          DateTime?                @map("opened_at")
  convertedAt       DateTime?                @map("converted_at")
  revokedAt         DateTime?                @map("revoked_at")
  createdByUserId   String?                  @map("created_by_user_id") @db.Uuid
  createdAt         DateTime                 @default(now()) @map("created_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  campaign     ReviewAcquisitionCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  createdBy    User? @relation("AcquisitionInviteCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)
  feedback     ReviewAcquisitionFeedback[]
  events       ReviewAcquisitionEvent[]

  @@index([campaignId, status, expiresAt], map: "review_acquisition_invites_campaign_status_idx")
  @@map("review_acquisition_invites")
}

model ReviewAcquisitionFeedback {
  id               String                    @id @default(uuid()) @db.Uuid
  organizationId   String                    @map("organization_id") @db.Uuid
  campaignId       String                    @map("campaign_id") @db.Uuid
  locationId       String?                   @map("location_id") @db.Uuid
  inviteId         String?                   @map("invite_id") @db.Uuid
  rating           Int
  text             String                    @default("") @db.Text
  contactName      String?                   @map("contact_name") @db.VarChar(180)
  contactEmail     String?                   @map("contact_email") @db.VarChar(320)
  contactPhone     String?                   @map("contact_phone") @db.VarChar(64)
  consentToContact Boolean                   @default(false) @map("consent_to_contact")
  status           AcquisitionFeedbackStatus @default(NEW)
  caseId           String?                   @map("case_id") @db.Uuid
  submittedAt      DateTime                  @default(now()) @map("submitted_at")
  acknowledgedAt   DateTime?                 @map("acknowledged_at")
  archivedAt       DateTime?                 @map("archived_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  campaign     ReviewAcquisitionCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  location     Location? @relation(fields: [locationId], references: [id], onDelete: SetNull)
  invite       ReviewAcquisitionInvite? @relation(fields: [inviteId], references: [id], onDelete: SetNull)
  case         ReputationCase? @relation(fields: [caseId], references: [id], onDelete: SetNull)
  events       ReviewAcquisitionEvent[]

  @@index([organizationId, submittedAt], map: "review_acquisition_feedback_org_submitted_idx")
  @@index([campaignId, rating, submittedAt], map: "review_acquisition_feedback_campaign_rating_idx")
  @@index([caseId], map: "review_acquisition_feedback_case_idx")
  @@index([inviteId], map: "review_acquisition_feedback_invite_idx")
  @@map("review_acquisition_feedback")
}

model ReviewAcquisitionEvent {
  id                   String               @id @default(uuid()) @db.Uuid
  organizationId       String               @map("organization_id") @db.Uuid
  campaignId           String               @map("campaign_id") @db.Uuid
  inviteId             String?              @map("invite_id") @db.Uuid
  feedbackId           String?              @map("feedback_id") @db.Uuid
  targetId             String?              @map("target_id") @db.Uuid
  type                 AcquisitionEventType
  anonymousSessionHash String?              @map("anonymous_session_hash") @db.VarChar(128)
  dedupeKey            String?              @map("dedupe_key") @db.VarChar(240)
  metadata             Json?
  createdAt            DateTime             @default(now()) @map("created_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  campaign     ReviewAcquisitionCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  invite       ReviewAcquisitionInvite? @relation(fields: [inviteId], references: [id], onDelete: SetNull)
  feedback     ReviewAcquisitionFeedback? @relation(fields: [feedbackId], references: [id], onDelete: SetNull)
  target       ReviewAcquisitionTarget? @relation(fields: [targetId], references: [id], onDelete: SetNull)

  @@unique([campaignId, dedupeKey], map: "review_acquisition_events_campaign_dedupe_key")
  @@index([campaignId, type, createdAt], map: "review_acquisition_events_campaign_type_created_idx")
  @@index([organizationId, createdAt], map: "review_acquisition_events_org_created_idx")
  @@map("review_acquisition_events")
}

model Task {
''')

patch('backend/src/app.ts', "import { casesRoutes } from './modules/cases/cases.routes.js';\n", "import { casesRoutes } from './modules/cases/cases.routes.js';\nimport { acquisitionRoutes } from './modules/acquisition/acquisition.routes.js';\n")
patch('backend/src/app.ts', "  await app.register(casesRoutes, { prefix: '/api/v1' });\n", "  await app.register(casesRoutes, { prefix: '/api/v1' });\n  await app.register(acquisitionRoutes, { prefix: '/api/v1' });\n")

permissions = ROOT / 'backend/src/core/rbac/permissions.ts'
text = permissions.read_text(encoding='utf-8')
text = text.replace("  'cases.verify',\n", "  'cases.verify',\n  'acquisition.view',\n  'acquisition.manage',\n", 1)
text = text.replace("  'cases.view',\n  'tasks.view',\n", "  'cases.view',\n  'acquisition.view',\n  'tasks.view',\n", 1)
text = text.replace("  'cases.view', 'cases.manage', 'cases.verify',\n", "  'cases.view', 'cases.manage', 'cases.verify',\n  'acquisition.view', 'acquisition.manage',\n", 1)
text = text.replace("  'cases.view',\n  'tasks.view'", "  'cases.view',\n  'acquisition.view',\n  'tasks.view'", 1)
permissions.write_text(text, encoding='utf-8')
print('patched backend acquisition RBAC')

print('P21 integration patch applied')
