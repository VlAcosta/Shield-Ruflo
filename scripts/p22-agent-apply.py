#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P22 patch anchor not found: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')


schema = 'backend/prisma/schema.prisma'
patch(schema, '''enum AcquisitionInviteStatus {
  CREATED
  OPENED
  CONVERTED
  EXPIRED
  REVOKED

  @@map("acquisition_invite_status")
}
''', '''enum AcquisitionInviteStatus {
  CREATED
  OPENED
  CONVERTED
  EXPIRED
  REVOKED

  @@map("acquisition_invite_status")
}

enum CompetitiveCompetitorStatus {
  ACTIVE
  PAUSED
  ARCHIVED

  @@map("competitive_competitor_status")
}

enum CompetitiveSourceProvider {
  MANUAL
  GOOGLE_PLACES

  @@map("competitive_source_provider")
}

enum CompetitiveStoragePolicy {
  PERSISTABLE
  LIVE_ONLY

  @@map("competitive_storage_policy")
}

enum CompetitiveSourceStatus {
  CONFIGURED
  DEGRADED
  ERROR
  DISABLED

  @@map("competitive_source_status")
}
''')

patch(schema, '''  createdAcquisitionCampaigns ReviewAcquisitionCampaign[] @relation("AcquisitionCampaignCreator")
  createdAcquisitionInvites   ReviewAcquisitionInvite[] @relation("AcquisitionInviteCreator")
  notifications              Notification[]        @relation("NotificationUser")
''', '''  createdAcquisitionCampaigns ReviewAcquisitionCampaign[] @relation("AcquisitionCampaignCreator")
  createdAcquisitionInvites   ReviewAcquisitionInvite[] @relation("AcquisitionInviteCreator")
  createdCompetitiveCompetitors CompetitiveCompetitor[] @relation("CompetitiveCompetitorCreator")
  createdCompetitiveSnapshots CompetitiveMetricSnapshot[] @relation("CompetitiveSnapshotCreator")
  notifications              Notification[]        @relation("NotificationUser")
''')

patch(schema, '''  acquisitionCampaigns    ReviewAcquisitionCampaign[]
  acquisitionFeedback     ReviewAcquisitionFeedback[]
  acquisitionInvites      ReviewAcquisitionInvite[]
  acquisitionEvents       ReviewAcquisitionEvent[]
  subscriptions          Subscription[]
''', '''  acquisitionCampaigns    ReviewAcquisitionCampaign[]
  acquisitionFeedback     ReviewAcquisitionFeedback[]
  acquisitionInvites      ReviewAcquisitionInvite[]
  acquisitionEvents       ReviewAcquisitionEvent[]
  competitiveCompetitors  CompetitiveCompetitor[]
  competitiveLocations    CompetitiveLocation[]
  competitiveSources      CompetitiveSource[]
  competitiveSnapshots    CompetitiveMetricSnapshot[]
  subscriptions          Subscription[]
''')

patch(schema, '''model Task {
''', '''model CompetitiveCompetitor {
  id              String                      @id @default(uuid()) @db.Uuid
  organizationId  String                      @map("organization_id") @db.Uuid
  name            String                      @db.VarChar(180)
  website         String?                     @db.Text
  status          CompetitiveCompetitorStatus @default(ACTIVE)
  notes           String                      @default("") @db.Text
  createdByUserId String?                     @map("created_by_user_id") @db.Uuid
  createdAt       DateTime                    @default(now()) @map("created_at")
  updatedAt       DateTime                    @updatedAt @map("updated_at")
  archivedAt      DateTime?                   @map("archived_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy    User?        @relation("CompetitiveCompetitorCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)
  locations    CompetitiveLocation[]

  @@index([organizationId, status, createdAt], map: "competitive_competitors_org_status_idx")
  @@map("competitive_competitors")
}

model CompetitiveLocation {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  competitorId   String   @map("competitor_id") @db.Uuid
  name           String   @db.VarChar(180)
  addressLabel   String?  @map("address_label") @db.VarChar(500)
  city           String?  @db.VarChar(180)
  region         String?  @db.VarChar(180)
  countryCode    String?  @map("country_code") @db.VarChar(2)
  website        String?  @db.Text
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization    Organization         @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  competitor      CompetitiveCompetitor @relation(fields: [competitorId], references: [id], onDelete: Cascade)
  sources         CompetitiveSource[]
  metricSnapshots CompetitiveMetricSnapshot[]

  @@index([organizationId, competitorId, createdAt], map: "competitive_locations_org_competitor_idx")
  @@map("competitive_locations")
}

model CompetitiveSource {
  id                   String                   @id @default(uuid()) @db.Uuid
  organizationId       String                   @map("organization_id") @db.Uuid
  competitorLocationId String                   @map("competitor_location_id") @db.Uuid
  provider             CompetitiveSourceProvider
  externalId           String?                  @map("external_id") @db.VarChar(512)
  storagePolicy        CompetitiveStoragePolicy @map("storage_policy")
  status               CompetitiveSourceStatus  @default(CONFIGURED)
  lastCheckedAt        DateTime?                @map("last_checked_at")
  lastErrorCode        String?                  @map("last_error_code") @db.VarChar(120)
  createdAt            DateTime                 @default(now()) @map("created_at")
  updatedAt            DateTime                 @updatedAt @map("updated_at")

  organization       Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  competitorLocation CompetitiveLocation @relation(fields: [competitorLocationId], references: [id], onDelete: Cascade)
  metricSnapshots    CompetitiveMetricSnapshot[]

  @@unique([competitorLocationId, provider], map: "competitive_sources_location_provider_key")
  @@index([organizationId, provider, status], map: "competitive_sources_org_provider_status_idx")
  @@map("competitive_sources")
}

model CompetitiveMetricSnapshot {
  id                   String   @id @default(uuid()) @db.Uuid
  organizationId       String   @map("organization_id") @db.Uuid
  competitorLocationId String   @map("competitor_location_id") @db.Uuid
  sourceId             String   @map("source_id") @db.Uuid
  observedAt           DateTime @map("observed_at")
  averageRating        Float?   @map("average_rating")
  reviewCount          Int?     @map("review_count")
  reviewVelocity30d    Float?   @map("review_velocity_30d")
  positiveShare        Float?   @map("positive_share")
  negativeShare        Float?   @map("negative_share")
  responseRate         Float?   @map("response_rate")
  reputationScore      Float?   @map("reputation_score")
  notes                String   @default("") @db.VarChar(2000)
  dedupeKey            String?  @map("dedupe_key") @db.VarChar(240)
  createdByUserId      String?  @map("created_by_user_id") @db.Uuid
  createdAt            DateTime @default(now()) @map("created_at")

  organization       Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  competitorLocation CompetitiveLocation @relation(fields: [competitorLocationId], references: [id], onDelete: Cascade)
  source             CompetitiveSource   @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  createdBy          User?               @relation("CompetitiveSnapshotCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@unique([sourceId, dedupeKey], map: "competitive_metric_snapshots_source_dedupe_key")
  @@index([competitorLocationId, observedAt], map: "competitive_metric_snapshots_location_observed_idx")
  @@index([organizationId, observedAt], map: "competitive_metric_snapshots_org_observed_idx")
  @@map("competitive_metric_snapshots")
}

model Task {
''')

patch('backend/src/app.ts', "import { acquisitionRoutes } from './modules/acquisition/acquisition.routes.js';\n", "import { acquisitionRoutes } from './modules/acquisition/acquisition.routes.js';\nimport { competitiveRoutes } from './modules/competitive/competitive.routes.js';\n")
patch('backend/src/app.ts', "  await app.register(acquisitionRoutes, { prefix: '/api/v1' });\n", "  await app.register(acquisitionRoutes, { prefix: '/api/v1' });\n  await app.register(competitiveRoutes, { prefix: '/api/v1' });\n")

permissions = ROOT / 'backend/src/core/rbac/permissions.ts'
text = permissions.read_text(encoding='utf-8')
text = text.replace("  'acquisition.manage',\n", "  'acquisition.manage',\n  'competitive.view',\n  'competitive.manage',\n", 1)
text = text.replace("  'acquisition.view',\n  'tasks.view',\n", "  'acquisition.view',\n  'competitive.view',\n  'tasks.view',\n", 1)
text = text.replace("  'acquisition.view', 'acquisition.manage',\n", "  'acquisition.view', 'acquisition.manage',\n  'competitive.view', 'competitive.manage',\n", 1)
text = text.replace("  'acquisition.view',\n  'tasks.view'", "  'acquisition.view',\n  'competitive.view',\n  'tasks.view'", 1)
permissions.write_text(text, encoding='utf-8')
print('patched backend competitive RBAC')

env_path = ROOT / 'backend/src/config/env.ts'
env = env_path.read_text(encoding='utf-8')
needle = "  GOOGLE_BUSINESS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),\n"
if needle not in env:
    raise SystemExit('P22 env anchor GOOGLE_BUSINESS_TIMEOUT_MS not found')
env = env.replace(needle, needle + "  GOOGLE_PLACES_ENABLED: booleanString.default('false'),\n  GOOGLE_PLACES_API_KEY: z.string().trim().default(''),\n  GOOGLE_PLACES_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),\n", 1)
env_path.write_text(env, encoding='utf-8')
print('patched competitive Google Places env')

print('P22 integration patch applied')
