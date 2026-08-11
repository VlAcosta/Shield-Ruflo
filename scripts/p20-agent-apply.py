#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P20 patch anchor not found: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')


schema = 'backend/prisma/schema.prisma'

patch(schema, '''enum NotificationStatus {
  UNREAD
  READ
  ARCHIVED

  @@map("notification_status")
}
''', '''enum NotificationStatus {
  UNREAD
  READ
  ARCHIVED

  @@map("notification_status")
}

enum ReputationCaseOrigin {
  REVIEW
  AI_TREND
  MANUAL
  SURVEY
  AUTOMATION

  @@map("reputation_case_origin")
}

enum ReputationCaseSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL

  @@map("reputation_case_severity")
}

enum ReputationCaseStatus {
  NEW
  TRIAGED
  ASSIGNED
  IN_PROGRESS
  WAITING_CUSTOMER
  WAITING_INTERNAL
  RESOLVED
  VERIFIED
  CLOSED

  @@map("reputation_case_status")
}

enum ReputationCaseMetricPhase {
  BASELINE
  RESOLUTION
  VERIFICATION

  @@map("reputation_case_metric_phase")
}
''')

patch(schema, '''  taskActivities             TaskActivity[]        @relation("TaskActivityActor")
  notifications              Notification[]        @relation("NotificationUser")
''', '''  taskActivities             TaskActivity[]        @relation("TaskActivityActor")
  createdReputationCases     ReputationCase[]      @relation("ReputationCaseCreator")
  reputationCaseActivities   ReputationCaseActivity[] @relation("ReputationCaseActivityActor")
  notifications              Notification[]        @relation("NotificationUser")
''')

patch(schema, '''  notifications          Notification[]
  subscriptions          Subscription[]
''', '''  notifications          Notification[]
  reputationCases        ReputationCase[]
  reputationCaseActivities ReputationCaseActivity[]
  reputationCaseMetricSnapshots ReputationCaseMetricSnapshot[]
  subscriptions          Subscription[]
''')

patch(schema, '''  taskAssignments    TaskAssignee[]     @relation("TaskAssigneeMember")

  @@unique([organizationId, userId], map: "organization_members_org_user_key")
''', '''  taskAssignments    TaskAssignee[]     @relation("TaskAssigneeMember")
  ownedReputationCases ReputationCase[] @relation("ReputationCaseOwner")

  @@unique([organizationId, userId], map: "organization_members_org_user_key")
''')

patch(schema, '''  reviews       Review[]
  tasks         Task[]

  @@index([businessId, status], map: "locations_business_status_idx")
''', '''  reviews       Review[]
  tasks         Task[]
  reputationCases ReputationCaseLocation[]

  @@index([businessId, status], map: "locations_business_status_idx")
''')

patch(schema, '''  aiOperations  AiOperation[]
  tasks         Task[]

  @@unique([sourceId, externalId], map: "reviews_source_external_key")
''', '''  aiOperations  AiOperation[]
  tasks         Task[]
  reputationCases ReputationCaseReview[]

  @@unique([sourceId, externalId], map: "reviews_source_external_key")
''')

patch(schema, '''model Task {
''', '''model ReputationCase {
  id              String                    @id @default(uuid()) @db.Uuid
  organizationId  String                    @map("organization_id") @db.Uuid
  title           String                    @db.VarChar(240)
  category        String                    @db.VarChar(120)
  severity        ReputationCaseSeverity    @default(MEDIUM)
  status          ReputationCaseStatus      @default(NEW)
  origin          ReputationCaseOrigin      @default(MANUAL)
  ownerMemberId   String?                   @map("owner_member_id") @db.Uuid
  slaMinutes      Int?                      @map("sla_minutes")
  dueAt           DateTime?                 @map("due_at")
  rootCause       String?                   @map("root_cause") @db.Text
  resolution      String?                   @db.Text
  outcome         Json?
  sourceDedupeKey String?                   @map("source_dedupe_key") @db.VarChar(240)
  reopenedAt      DateTime?                 @map("reopened_at")
  resolvedAt      DateTime?                 @map("resolved_at")
  verifiedAt      DateTime?                 @map("verified_at")
  closedAt        DateTime?                 @map("closed_at")
  createdByUserId String?                   @map("created_by_user_id") @db.Uuid
  createdAt       DateTime                  @default(now()) @map("created_at")
  updatedAt       DateTime                  @updatedAt @map("updated_at")

  organization    Organization              @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  owner           OrganizationMember?       @relation("ReputationCaseOwner", fields: [ownerMemberId], references: [id], onDelete: SetNull)
  createdBy       User?                     @relation("ReputationCaseCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)
  reviews         ReputationCaseReview[]
  locations       ReputationCaseLocation[]
  tasks           Task[]
  activities      ReputationCaseActivity[]
  metricSnapshots ReputationCaseMetricSnapshot[]

  @@unique([organizationId, sourceDedupeKey], map: "reputation_cases_org_source_dedupe_key")
  @@index([organizationId, status, dueAt], map: "reputation_cases_org_status_due_idx")
  @@index([organizationId, severity, createdAt], map: "reputation_cases_org_severity_created_idx")
  @@index([ownerMemberId, status], map: "reputation_cases_owner_status_idx")
  @@index([organizationId, category, createdAt], map: "reputation_cases_org_category_created_idx")
  @@map("reputation_cases")
}

model ReputationCaseReview {
  caseId   String   @map("case_id") @db.Uuid
  reviewId String   @map("review_id") @db.Uuid
  addedAt  DateTime @default(now()) @map("added_at")

  case   ReputationCase @relation(fields: [caseId], references: [id], onDelete: Cascade)
  review Review         @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  @@id([caseId, reviewId])
  @@index([reviewId, addedAt], map: "reputation_case_reviews_review_idx")
  @@map("reputation_case_reviews")
}

model ReputationCaseLocation {
  caseId     String   @map("case_id") @db.Uuid
  locationId String   @map("location_id") @db.Uuid
  addedAt    DateTime @default(now()) @map("added_at")

  case     ReputationCase @relation(fields: [caseId], references: [id], onDelete: Cascade)
  location Location       @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@id([caseId, locationId])
  @@index([locationId, addedAt], map: "reputation_case_locations_location_idx")
  @@map("reputation_case_locations")
}

model ReputationCaseActivity {
  id             String                @id @default(uuid()) @db.Uuid
  organizationId String                @map("organization_id") @db.Uuid
  caseId         String                @map("case_id") @db.Uuid
  actorUserId    String?               @map("actor_user_id") @db.Uuid
  action         String                @db.VarChar(120)
  fromStatus     ReputationCaseStatus? @map("from_status")
  toStatus       ReputationCaseStatus? @map("to_status")
  metadata       Json?
  createdAt      DateTime              @default(now()) @map("created_at")

  organization Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  case         ReputationCase @relation(fields: [caseId], references: [id], onDelete: Cascade)
  actor        User?          @relation("ReputationCaseActivityActor", fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt], map: "reputation_case_activities_org_created_idx")
  @@index([caseId, createdAt], map: "reputation_case_activities_case_created_idx")
  @@map("reputation_case_activities")
}

model ReputationCaseMetricSnapshot {
  id             String                    @id @default(uuid()) @db.Uuid
  organizationId String                    @map("organization_id") @db.Uuid
  caseId         String                    @map("case_id") @db.Uuid
  phase          ReputationCaseMetricPhase
  periodStart    DateTime                  @map("period_start")
  periodEnd      DateTime                  @map("period_end")
  metrics        Json
  measuredAt     DateTime                  @default(now()) @map("measured_at")

  organization Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  case         ReputationCase @relation(fields: [caseId], references: [id], onDelete: Cascade)

  @@index([caseId, phase, measuredAt], map: "reputation_case_metric_snapshots_case_phase_idx")
  @@index([organizationId, measuredAt], map: "reputation_case_metric_snapshots_org_measured_idx")
  @@map("reputation_case_metric_snapshots")
}

model Task {
''')

patch(schema, '''  reviewId       String?      @map("review_id") @db.Uuid
  title          String       @db.VarChar(240)
''', '''  reviewId       String?      @map("review_id") @db.Uuid
  caseId         String?      @map("case_id") @db.Uuid
  title          String       @db.VarChar(240)
''')
patch(schema, '''  review       Review?       @relation(fields: [reviewId], references: [id], onDelete: SetNull)
  createdBy    User          @relation("TaskCreator", fields: [createdByUserId], references: [id], onDelete: Restrict)
''', '''  review       Review?       @relation(fields: [reviewId], references: [id], onDelete: SetNull)
  case         ReputationCase? @relation(fields: [caseId], references: [id], onDelete: SetNull)
  createdBy    User          @relation("TaskCreator", fields: [createdByUserId], references: [id], onDelete: Restrict)
''')
patch(schema, '''  @@index([reviewId], map: "tasks_review_idx")
  @@index([businessId, status], map: "tasks_business_status_idx")
''', '''  @@index([reviewId], map: "tasks_review_idx")
  @@index([caseId], map: "tasks_case_idx")
  @@index([businessId, status], map: "tasks_business_status_idx")
''')

# API registration.
patch('backend/src/app.ts', "import { operationsRoutes } from './modules/operations/operations.routes.js';\n", "import { operationsRoutes } from './modules/operations/operations.routes.js';\nimport { casesRoutes } from './modules/cases/cases.routes.js';\n")
patch('backend/src/app.ts', "  await app.register(tasksRoutes, { prefix: '/api/v1' });\n", "  await app.register(tasksRoutes, { prefix: '/api/v1' });\n  await app.register(casesRoutes, { prefix: '/api/v1' });\n")

# RBAC: Cases are first-class reputation operations.
permissions = ROOT / 'backend/src/core/rbac/permissions.ts'
text = permissions.read_text(encoding='utf-8')
text = text.replace("  'reviews.intelligence.reanalyze',\n", "  'reviews.intelligence.reanalyze',\n  'cases.view',\n  'cases.manage',\n  'cases.verify',\n", 1)
text = text.replace("  'reviews.intelligence.read',\n  'tasks.view',\n", "  'reviews.intelligence.read',\n  'cases.view',\n  'tasks.view',\n", 1)
text = text.replace("  'reviews.view', 'reviews.reply', 'reviews.moderate', 'reviews.legal', 'reviews.intelligence.read', 'reviews.intelligence.reanalyze',\n", "  'reviews.view', 'reviews.reply', 'reviews.moderate', 'reviews.legal', 'reviews.intelligence.read', 'reviews.intelligence.reanalyze',\n  'cases.view', 'cases.manage', 'cases.verify',\n", 1)
text = text.replace("  'reviews.view', 'reviews.reply', 'reviews.intelligence.read',\n", "  'reviews.view', 'reviews.reply', 'reviews.intelligence.read',\n  'cases.view',\n", 1)
permissions.write_text(text, encoding='utf-8')
print('patched backend RBAC')

# Task domain: allow a Task to be linked to one Case, retaining review/location links.
tasks_service = ROOT / 'backend/src/modules/tasks/tasks.service.ts'
text = tasks_service.read_text(encoding='utf-8')
text = text.replace("  reviewId?: string | null | undefined;\n", "  reviewId?: string | null | undefined;\n  caseId?: string | null | undefined;\n", 1)
text = text.replace("    reviewId?: string | null | undefined;\n  },\n", "    reviewId?: string | null | undefined;\n    caseId?: string | null | undefined;\n  },\n", 1)
text = text.replace("  if (input.reviewId) {\n    const review = await app.prisma.review.findFirst({ where: { id: input.reviewId, organizationId }, select: { id: true } });\n    if (!review) throw new AppError({ code: 'REVIEW_NOT_FOUND', message: 'Отзыв не найден', statusCode: 404 });\n  }\n", "  if (input.reviewId) {\n    const review = await app.prisma.review.findFirst({ where: { id: input.reviewId, organizationId }, select: { id: true } });\n    if (!review) throw new AppError({ code: 'REVIEW_NOT_FOUND', message: 'Отзыв не найден', statusCode: 404 });\n  }\n  if (input.caseId) {\n    const reputationCase = await app.prisma.reputationCase.findFirst({ where: { id: input.caseId, organizationId }, select: { id: true } });\n    if (!reputationCase) throw new AppError({ code: 'REPUTATION_CASE_NOT_FOUND', message: 'Репутационный кейс не найден', statusCode: 404 });\n  }\n", 1)
text = text.replace("    reviewId: task.reviewId,\n", "    reviewId: task.reviewId,\n    caseId: task.caseId,\n", 1)
text = text.replace("      reviewId: input.reviewId ?? null,\n", "      reviewId: input.reviewId ?? null,\n      caseId: input.caseId ?? null,\n", 1)
text = text.replace("    reviewId: patch.reviewId,\n  });\n", "    reviewId: patch.reviewId,\n    caseId: patch.caseId,\n  });\n", 1)
text = text.replace("  if (patch.reviewId !== undefined) activityMetadata.reviewId = patch.reviewId;\n", "  if (patch.reviewId !== undefined) activityMetadata.reviewId = patch.reviewId;\n  if (patch.caseId !== undefined) activityMetadata.caseId = patch.caseId;\n", 1)
text = text.replace("        ...(patch.reviewId !== undefined ? { reviewId: patch.reviewId } : {}),\n", "        ...(patch.reviewId !== undefined ? { reviewId: patch.reviewId } : {}),\n        ...(patch.caseId !== undefined ? { caseId: patch.caseId } : {}),\n", 1)
tasks_service.write_text(text, encoding='utf-8')
print('patched tasks.service.ts')

patch('backend/src/modules/tasks/tasks.routes.ts', "  reviewId: z.string().uuid().nullable().optional(),\n", "  reviewId: z.string().uuid().nullable().optional(),\n  caseId: z.string().uuid().nullable().optional(),\n")

print('P20 integration patch applied')
