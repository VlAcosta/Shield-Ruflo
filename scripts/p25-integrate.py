#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

schema_path = ROOT / 'backend/prisma/schema.prisma'
schema = schema_path.read_text(encoding='utf-8')
if 'model AskShieldQuery {' not in schema:
    schema = schema.replace('  notifications              Notification[]        @relation("NotificationUser")\n', '  notifications              Notification[]        @relation("NotificationUser")\n  askShieldQueries           AskShieldQuery[]        @relation("AskShieldQueryCreator")\n', 1)
    schema = schema.replace('  listingHealthIssues      ListingHealthIssue[]\n}', '  listingHealthIssues      ListingHealthIssue[]\n  askShieldQueries         AskShieldQuery[]\n}', 1)
    schema += r'''

enum AskShieldStatus {
  RUNNING
  SUCCEEDED
  FAILED

  @@map("ask_shield_status")
}

model AskShieldQuery {
  id                  String          @id @default(uuid()) @db.Uuid
  organizationId      String          @map("organization_id") @db.Uuid
  createdByUserId     String?         @map("created_by_user_id") @db.Uuid
  question            String          @db.Text
  status              AskShieldStatus @default(RUNNING)
  answer              String?         @db.Text
  evidence            Json            @default("[]")
  provider            String?         @db.VarChar(80)
  model               String?         @db.VarChar(180)
  promptVersion       String?         @map("prompt_version") @db.VarChar(80)
  inputTokens         Int?            @map("input_tokens")
  outputTokens        Int?            @map("output_tokens")
  estimatedCostMicros BigInt?         @map("estimated_cost_micros")
  errorCode           String?         @map("error_code") @db.VarChar(160)
  errorMessage        String?         @map("error_message") @db.Text
  createdAt           DateTime        @default(now()) @map("created_at")
  completedAt         DateTime?       @map("completed_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy    User?        @relation("AskShieldQueryCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt], map: "ask_shield_queries_org_created_idx")
  @@index([organizationId, status, createdAt], map: "ask_shield_queries_org_status_idx")
  @@map("ask_shield_queries")
}
'''
    schema_path.write_text(schema, encoding='utf-8')
    print('P25 Prisma model integrated')

app_path = ROOT / 'backend/src/app.ts'
app = app_path.read_text(encoding='utf-8')
if 'askShieldRoutes' not in app:
    anchor = "import { listingHealthRoutes } from './modules/listings/listing-health.routes.js';\n"
    if anchor not in app: raise SystemExit('P25 app import anchor missing')
    app = app.replace(anchor, anchor + "import { askShieldRoutes } from './modules/ask-shield/ask-shield.routes.js';\n", 1)
    reg = "  await app.register(listingHealthRoutes, { prefix: '/api/v1' });\n"
    if reg not in app: raise SystemExit('P25 app registration anchor missing')
    app = app.replace(reg, reg + "  await app.register(askShieldRoutes, { prefix: '/api/v1' });\n", 1)
    app_path.write_text(app, encoding='utf-8')
    print('P25 app integrated')

worker_path = ROOT / 'backend/src/worker.ts'
worker = worker_path.read_text(encoding='utf-8')
if 'processAskShieldJob' not in worker:
    anchor = "import { processListingSyncJob } from './modules/listings/listing-health.service.js';\n"
    if anchor not in worker: raise SystemExit('P25 worker import anchor missing')
    worker = worker.replace(anchor, anchor + "import { processAskShieldJob } from './modules/ask-shield/ask-shield.service.js';\n", 1)
    job_anchor = "  if (job.type === 'listing.sync') {"
    pos = worker.find(job_anchor)
    if pos < 0: raise SystemExit('P25 worker listing anchor missing')
    next_anchor = "  if (job.type === 'provider.publishReply' || job.type === 'provider.reconcileReply') {"
    next_pos = worker.find(next_anchor, pos)
    if next_pos < 0: raise SystemExit('P25 worker reply anchor missing')
    block = "  if (job.type === 'askShield.answer') {\n    const organizationId = String(job.payload?.organizationId || '');\n    const queryId = String(job.payload?.queryId || '');\n    if (!organizationId || !queryId) throw new Error('INVALID_ASK_SHIELD_JOB');\n    return processAskShieldJob(prisma, { organizationId, queryId });\n  }\n"
    worker = worker[:next_pos] + block + worker[next_pos:]
    worker_path.write_text(worker, encoding='utf-8')
    print('P25 worker integrated')

provider_path = ROOT / 'backend/src/modules/ai/providers/openai-review-intelligence.provider.ts'
provider = provider_path.read_text(encoding='utf-8')
if 'answerOpenAiShieldQuestion' not in provider:
    provider = provider.replace("import { runOpenAiVisibilityProbe } from './openai-visibility.js';\n", "import { runOpenAiVisibilityProbe } from './openai-visibility.js';\nimport { answerOpenAiShieldQuestion } from './openai-ask-shield.js';\n", 1)
    provider = provider.replace('  VisibilityProbeResult,\n', '  VisibilityProbeResult,\n  AskShieldInput,\n  AskShieldResult,\n', 1)
    method = "\n  async answerShieldQuestion(input: AskShieldInput): Promise<AskShieldResult> {\n    const availability = this.availability();\n    if (!availability.available) {\n      throw new AiProviderError({ code: availability.reasonCode ?? 'AI_PROVIDER_UNAVAILABLE', message: availability.reasonMessage ?? 'AI provider недоступен', retryable: false });\n    }\n    return answerOpenAiShieldQuestion(input, { id: this.id, model: this.model });\n  }\n"
    pos = provider.rfind('\n}')
    if pos < 0: raise SystemExit('P25 provider class closing brace missing')
    provider = provider[:pos] + method + provider[pos:]
    provider_path.write_text(provider, encoding='utf-8')
    print('P25 OpenAI Ask Shield capability integrated')
