#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, old, new, label):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if new in text:
        print(f'{label}: already integrated')
        return
    if old not in text:
        raise SystemExit(f'{label}: anchor not found')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'{label}: integrated')

schema = ROOT / 'backend/prisma/schema.prisma'
text = schema.read_text(encoding='utf-8')
if 'model AiVisibilityProbe {' not in text:
    text = text.replace(
        '  createdCompetitiveSnapshots CompetitiveMetricSnapshot[] @relation("CompetitiveSnapshotCreator")\n',
        '  createdCompetitiveSnapshots CompetitiveMetricSnapshot[] @relation("CompetitiveSnapshotCreator")\n  createdAiVisibilityProbes AiVisibilityProbe[] @relation("AiVisibilityProbeCreator")\n  createdAiVisibilityRuns AiVisibilityRun[] @relation("AiVisibilityRunCreator")\n', 1)
    text = text.replace(
        '  competitiveSnapshots    CompetitiveMetricSnapshot[]\n',
        '  competitiveSnapshots    CompetitiveMetricSnapshot[]\n  aiVisibilityProbes       AiVisibilityProbe[]\n  aiVisibilityRuns         AiVisibilityRun[]\n  aiVisibilityResults      AiVisibilityResult[]\n  aiVisibilityCitations    AiVisibilityCitation[]\n  aiVisibilityCompetitors  AiVisibilityCompetitor[]\n', 1)
    text = text.replace(
        '  acquisitionFeedback ReviewAcquisitionFeedback[]\n',
        '  acquisitionFeedback ReviewAcquisitionFeedback[]\n  aiVisibilityProbes AiVisibilityProbe[]\n', 1)
    text = text.replace(
        '  snapshots       CompetitiveMetricSnapshot[]\n',
        '  snapshots       CompetitiveMetricSnapshot[]\n  aiVisibilityMentions AiVisibilityCompetitor[]\n', 1)
    text += r'''

enum AiVisibilityProbeStatus {
  ACTIVE
  PAUSED
  ARCHIVED

  @@map("ai_visibility_probe_status")
}

enum AiVisibilityRunStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED

  @@map("ai_visibility_run_status")
}

enum AiVisibilitySentiment {
  POSITIVE
  NEUTRAL
  NEGATIVE
  MIXED
  UNKNOWN

  @@map("ai_visibility_sentiment")
}

enum AiVisibilityCitationMeasurement {
  SUPPORTED
  UNSUPPORTED

  @@map("ai_visibility_citation_measurement")
}

model AiVisibilityProbe {
  id              String                  @id @default(uuid()) @db.Uuid
  organizationId  String                  @map("organization_id") @db.Uuid
  locationId      String?                 @map("location_id") @db.Uuid
  name            String                  @db.VarChar(180)
  query           String                  @db.Text
  languageCode    String                  @default("ru") @map("language_code") @db.VarChar(16)
  countryCode     String?                 @map("country_code") @db.Char(2)
  status          AiVisibilityProbeStatus @default(ACTIVE)
  createdByUserId String?                 @map("created_by_user_id") @db.Uuid
  createdAt       DateTime                @default(now()) @map("created_at")
  updatedAt       DateTime                @updatedAt @map("updated_at")
  archivedAt      DateTime?               @map("archived_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  location     Location?    @relation(fields: [locationId], references: [id], onDelete: SetNull)
  createdBy    User?        @relation("AiVisibilityProbeCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)
  runs         AiVisibilityRun[]

  @@index([organizationId, status, createdAt], map: "ai_visibility_probes_org_status_idx")
  @@index([locationId, status], map: "ai_visibility_probes_location_idx")
  @@map("ai_visibility_probes")
}

model AiVisibilityRun {
  id                  String                @id @default(uuid()) @db.Uuid
  organizationId      String                @map("organization_id") @db.Uuid
  probeId             String                @map("probe_id") @db.Uuid
  status              AiVisibilityRunStatus @default(QUEUED)
  provider            String?               @db.VarChar(80)
  model               String?               @db.VarChar(180)
  modelVersion        String?               @map("model_version") @db.VarChar(180)
  promptVersion       String?               @map("prompt_version") @db.VarChar(80)
  inputHash           String?               @map("input_hash") @db.VarChar(128)
  inputTokens         Int?                  @map("input_tokens")
  outputTokens        Int?                  @map("output_tokens")
  estimatedCostMicros BigInt?               @map("estimated_cost_micros")
  errorCode           String?               @map("error_code") @db.VarChar(160)
  errorMessage        String?               @map("error_message") @db.Text
  queuedAt            DateTime              @default(now()) @map("queued_at")
  startedAt           DateTime?             @map("started_at")
  completedAt         DateTime?             @map("completed_at")
  createdByUserId     String?               @map("created_by_user_id") @db.Uuid
  createdAt           DateTime              @default(now()) @map("created_at")

  organization Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  probe        AiVisibilityProbe  @relation(fields: [probeId], references: [id], onDelete: Cascade)
  createdBy    User?              @relation("AiVisibilityRunCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)
  result       AiVisibilityResult?

  @@index([organizationId, status, createdAt], map: "ai_visibility_runs_org_status_idx")
  @@index([probeId, createdAt], map: "ai_visibility_runs_probe_created_idx")
  @@map("ai_visibility_runs")
}

model AiVisibilityResult {
  id                  String                          @id @default(uuid()) @db.Uuid
  organizationId      String                          @map("organization_id") @db.Uuid
  runId               String                          @unique @map("run_id") @db.Uuid
  brandMentioned      Boolean                         @map("brand_mentioned")
  brandPosition       Int?                            @map("brand_position")
  sentiment           AiVisibilitySentiment           @default(UNKNOWN)
  answerText          String                          @map("answer_text") @db.Text
  recommendations     Json                            @default("[]")
  citationMeasurement AiVisibilityCitationMeasurement @default(UNSUPPORTED) @map("citation_measurement")
  createdAt           DateTime                        @default(now()) @map("created_at")

  organization Organization             @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  run          AiVisibilityRun           @relation(fields: [runId], references: [id], onDelete: Cascade)
  citations    AiVisibilityCitation[]
  competitors  AiVisibilityCompetitor[]

  @@index([organizationId, createdAt], map: "ai_visibility_results_org_created_idx")
  @@map("ai_visibility_results")
}

model AiVisibilityCitation {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  resultId       String   @map("result_id") @db.Uuid
  url            String   @db.Text
  title          String?  @db.VarChar(500)
  domain         String?  @db.VarChar(255)
  position       Int?
  qualityScore   Float?   @map("quality_score")
  createdAt      DateTime @default(now()) @map("created_at")

  organization Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  result       AiVisibilityResult @relation(fields: [resultId], references: [id], onDelete: Cascade)

  @@index([resultId, position], map: "ai_visibility_citations_result_idx")
  @@index([organizationId, createdAt], map: "ai_visibility_citations_org_created_idx")
  @@map("ai_visibility_citations")
}

model AiVisibilityCompetitor {
  id                  String   @id @default(uuid()) @db.Uuid
  organizationId      String   @map("organization_id") @db.Uuid
  resultId            String   @map("result_id") @db.Uuid
  name                String   @db.VarChar(240)
  position            Int?
  matchedCompetitorId String?  @map("matched_competitor_id") @db.Uuid
  createdAt           DateTime @default(now()) @map("created_at")

  organization      Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  result            AiVisibilityResult    @relation(fields: [resultId], references: [id], onDelete: Cascade)
  matchedCompetitor CompetitiveCompetitor? @relation(fields: [matchedCompetitorId], references: [id], onDelete: SetNull)

  @@index([resultId, position], map: "ai_visibility_competitors_result_idx")
  @@index([organizationId, createdAt], map: "ai_visibility_competitors_org_created_idx")
  @@map("ai_visibility_competitors")
}
'''
    schema.write_text(text, encoding='utf-8')
    print('Prisma P23 models integrated')
else:
    print('Prisma P23 models already integrated')

replace_once(
    'backend/src/app.ts',
    "import { competitiveRoutes } from './modules/competitive/competitive.routes.js';\n",
    "import { competitiveRoutes } from './modules/competitive/competitive.routes.js';\nimport { aiVisibilityRoutes } from './modules/ai-visibility/ai-visibility.routes.js';\n",
    'app import')
replace_once(
    'backend/src/app.ts',
    "  await app.register(competitiveRoutes, { prefix: '/api/v1' });\n",
    "  await app.register(competitiveRoutes, { prefix: '/api/v1' });\n  await app.register(aiVisibilityRoutes, { prefix: '/api/v1' });\n",
    'app registration')

rbac = ROOT / 'backend/src/core/rbac/permissions.ts'
r = rbac.read_text(encoding='utf-8')
if "'ai_visibility.view'" not in r:
    r = r.replace("  'competitive.manage',\n", "  'competitive.manage',\n  'ai_visibility.view',\n  'ai_visibility.manage',\n  'ai_visibility.run',\n", 1)
    r = r.replace("  'competitive.view',\n  'tasks.view',", "  'competitive.view',\n  'ai_visibility.view',\n  'tasks.view',", 1)
    r = r.replace("  'competitive.view', 'competitive.manage',\n", "  'competitive.view', 'competitive.manage',\n  'ai_visibility.view', 'ai_visibility.manage', 'ai_visibility.run',\n", 1)
    # MEMBER gets read-only visibility; running a paid external probe is restricted to manager+.
    marker = "  'competitive.view',\n  'tasks.view', 'tasks.create', 'tasks.edit',"
    if marker in r:
        r = r.replace(marker, "  'competitive.view',\n  'ai_visibility.view',\n  'tasks.view', 'tasks.create', 'tasks.edit',", 1)
    rbac.write_text(r, encoding='utf-8')
    print('RBAC integrated')

worker = ROOT / 'backend/src/worker.ts'
w = worker.read_text(encoding='utf-8')
if "processVisibilityRunJob" not in w:
    w = w.replace(
        "import { replyGenerationModeSchema } from './modules/ai/reply-copilot.schemas.js';\n",
        "import { replyGenerationModeSchema } from './modules/ai/reply-copilot.schemas.js';\nimport { processVisibilityRunJob } from './modules/ai-visibility/ai-visibility.service.js';\n", 1)
    anchor = "  if (job.type === 'provider.publishReply' || job.type === 'provider.reconcileReply') {"
    block = "  if (job.type === 'aiVisibility.run') {\n    const organizationId = String(job.payload?.organizationId || '');\n    const runId = String(job.payload?.runId || '');\n    if (!organizationId || !runId) throw new Error('INVALID_AI_VISIBILITY_JOB');\n    return processVisibilityRunJob(prisma, { organizationId, runId });\n  }\n"
    w = w.replace(anchor, block + anchor, 1)
    worker.write_text(w, encoding='utf-8')
    print('worker integrated')

provider = ROOT / 'backend/src/modules/ai/providers/openai-review-intelligence.provider.ts'
p = provider.read_text(encoding='utf-8')
if "runOpenAiVisibilityProbe" not in p:
    p = p.replace(
        "import { redactPii } from '../privacy/pii-redaction.js';\n",
        "import { redactPii } from '../privacy/pii-redaction.js';\nimport { runOpenAiVisibilityProbe } from './openai-visibility.js';\n", 1)
    p = p.replace(
        "  GenerateReplyResult,\n",
        "  GenerateReplyResult,\n  VisibilityProbeInput,\n  VisibilityProbeResult,\n", 1)
    method = "\n  async runVisibilityProbe(input: VisibilityProbeInput): Promise<VisibilityProbeResult> {\n    const availability = this.availability();\n    if (!availability.available) {\n      throw new AiProviderError({ code: availability.reasonCode ?? 'AI_PROVIDER_UNAVAILABLE', message: availability.reasonMessage ?? 'AI provider недоступен', retryable: false });\n    }\n    return runOpenAiVisibilityProbe(input, { id: this.id, model: this.model });\n  }\n"
    pos = p.rfind('\n}')
    if pos < 0:
        raise SystemExit('provider class closing anchor not found')
    p = p[:pos] + method + p[pos:]
    provider.write_text(p, encoding='utf-8')
    print('OpenAI visibility capability integrated')
