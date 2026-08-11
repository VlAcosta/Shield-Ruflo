#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P19 patch anchor not found: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')


# Prisma enums and relations.
patch('backend/prisma/schema.prisma', '''enum ReviewReplyStatus {
  DRAFT
  PENDING
  READY_TO_PUBLISH
  PUBLISHED
  FAILED
  REJECTED

  @@map("review_reply_status")
}
''', '''enum ReviewReplyStatus {
  DRAFT
  PENDING
  READY_TO_PUBLISH
  PUBLISH_QUEUED
  PUBLISHING
  PUBLISHED
  PUBLISH_FAILED
  PUBLISH_UNKNOWN
  FAILED
  REJECTED

  @@map("review_reply_status")
}

enum ReviewReplyOrigin {
  HUMAN
  AI
  AI_EDITED
  AUTOPILOT

  @@map("review_reply_origin")
}
''')

patch('backend/prisma/schema.prisma', '''  reviewInsights         ReviewInsight[]
  aiOperations           AiOperation[]
  tasks                  Task[]
''', '''  reviewInsights         ReviewInsight[]
  aiOperations           AiOperation[]
  brandVoiceProfile      BrandVoiceProfile?
  replyAutopilotPolicy   ReplyAutopilotPolicy?
  tasks                  Task[]
''')

patch('backend/prisma/schema.prisma', '''  insightId           String?           @map("insight_id") @db.Uuid
  operationType       String            @map("operation_type") @db.VarChar(80)
''', '''  insightId           String?           @map("insight_id") @db.Uuid
  replyId             String?           @map("reply_id") @db.Uuid
  operationType       String            @map("operation_type") @db.VarChar(80)
''')
patch('backend/prisma/schema.prisma', '''  review       Review?        @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  insight      ReviewInsight? @relation(fields: [insightId], references: [id], onDelete: SetNull)

  @@index([organizationId, status, createdAt], map: "ai_operations_org_status_created_idx")
''', '''  review       Review?        @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  insight      ReviewInsight? @relation(fields: [insightId], references: [id], onDelete: SetNull)
  reply        ReviewReply?   @relation(fields: [replyId], references: [id], onDelete: SetNull)

  @@index([organizationId, status, createdAt], map: "ai_operations_org_status_created_idx")
  @@index([replyId, createdAt], map: "ai_operations_reply_created_idx")
''')

patch('backend/prisma/schema.prisma', '''model ReviewTag {
''', '''model BrandVoiceProfile {
  id                 String   @id @default(uuid()) @db.Uuid
  organizationId     String   @unique @map("organization_id") @db.Uuid
  tone               String   @default("PROFESSIONAL") @db.VarChar(32)
  formality          String   @default("BALANCED") @db.VarChar(32)
  primaryLanguage    String   @default("ru") @map("primary_language") @db.VarChar(16)
  responseLength     String   @default("MEDIUM") @map("response_length") @db.VarChar(32)
  greetingStyle      String   @default("") @map("greeting_style") @db.VarChar(240)
  signature          String   @default("") @db.VarChar(240)
  preferredPhrases   Json     @default("[]") @map("preferred_phrases")
  prohibitedPhrases  Json     @default("[]") @map("prohibited_phrases")
  legalDisclaimer    String   @default("") @map("legal_disclaimer") @db.Text
  compensationPolicy String   @default("REQUIRE_APPROVAL") @map("compensation_policy") @db.VarChar(32)
  escalationTriggers Json     @default("[]") @map("escalation_triggers")
  customInstructions String   @default("") @map("custom_instructions") @db.Text
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@map("brand_voice_profiles")
}

model ReplyAutopilotPolicy {
  id                    String   @id @default(uuid()) @db.Uuid
  organizationId        String   @unique @map("organization_id") @db.Uuid
  enabled               Boolean  @default(false)
  minimumRating         Int      @default(4) @map("minimum_rating")
  maximumReputationRisk Int      @default(20) @map("maximum_reputation_risk")
  minimumAiConfidence   Float    @default(0.95) @map("minimum_ai_confidence")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@map("reply_autopilot_policies")
}

model ReviewTag {
''')

patch('backend/prisma/schema.prisma', '''  retryCount         Int               @default(0) @map("retry_count")
  createdAt          DateTime          @default(now()) @map("created_at")
''', '''  retryCount              Int               @default(0) @map("retry_count")
  origin                  ReviewReplyOrigin @default(HUMAN)
  generationMode          String?           @map("generation_mode") @db.VarChar(32)
  policyDecision          String?           @map("policy_decision") @db.VarChar(32)
  policyVersion           String?           @map("policy_version") @db.VarChar(80)
  policyMetadata          Json?             @map("policy_metadata")
  providerState           String?           @map("provider_state") @db.VarChar(80)
  providerPolicyViolation Json?             @map("provider_policy_violation")
  lastReconciledAt        DateTime?          @map("last_reconciled_at")
  createdAt               DateTime           @default(now()) @map("created_at")
''')
patch('backend/prisma/schema.prisma', '''  authorUser   User?        @relation("ReviewReplyAuthor", fields: [authorUserId], references: [id], onDelete: SetNull)

  @@unique([reviewId, version], map: "review_replies_review_version_key")
''', '''  authorUser   User?        @relation("ReviewReplyAuthor", fields: [authorUserId], references: [id], onDelete: SetNull)
  aiOperations AiOperation[]

  @@unique([reviewId, version], map: "review_replies_review_version_key")
''')

# ReviewReply workflow: version locking, policy check, real async publish.
replies = ROOT / 'backend/src/modules/reviews/review-replies.service.ts'
text = replies.read_text(encoding='utf-8')
text = text.replace("import { presentReview, reviewInclude } from './reviews.service.js';\n", "import { presentReview, reviewInclude } from './reviews.service.js';\nimport { evaluateReplyPolicy } from '../ai/reply-policy.service.js';\nimport { enqueueReplyPublication } from './review-publishing.service.js';\n")
text = text.replace("  const createdReply = await app.prisma.$transaction(async (tx) => {\n    const latest = await tx.reviewReply.findFirst({\n", "  const createdReply = await app.prisma.$transaction(async (tx) => {\n    await tx.$queryRaw<Array<{ acquired: number }>>`SELECT 1::int AS acquired FROM (SELECT pg_advisory_xact_lock(hashtext(${reviewId}), 19)) AS advisory_lock`;\n    const latest = await tx.reviewReply.findFirst({\n")
text = text.replace("      select: { version: true },\n    });\n    const version = (latest?.version ?? 0) + 1;\n\n    const reply = await tx.reviewReply.create({\n", "      select: { version: true, origin: true },\n    });\n    const version = (latest?.version ?? 0) + 1;\n    const origin = latest && ['AI', 'AI_EDITED', 'AUTOPILOT'].includes(latest.origin) ? 'AI_EDITED' : 'HUMAN';\n\n    const reply = await tx.reviewReply.create({\n")
text = text.replace("        status: 'DRAFT',\n        version,\n", "        status: 'DRAFT',\n        version,\n        origin,\n")
old_submit = """  const result = await app.prisma.$transaction(async (tx) => {
    const changed = await tx.reviewReply.updateMany({
      where: { id: reply.id, organizationId, reviewId, status: 'DRAFT' },
      data: { status: 'PENDING' },
    });
"""
new_submit = """  const policy = await evaluateReplyPolicy(app.prisma, { organizationId, reviewId, text: reply.text });
  if (policy.decision === 'BLOCK') {
    throw new AppError({ code: 'REVIEW_REPLY_POLICY_BLOCKED', message: 'Ответ не прошёл политику безопасной публикации', statusCode: 422, details: policy });
  }
  const result = await app.prisma.$transaction(async (tx) => {
    const changed = await tx.reviewReply.updateMany({
      where: { id: reply.id, organizationId, reviewId, status: 'DRAFT' },
      data: { status: 'PENDING', policyDecision: policy.decision, policyVersion: policy.policyVersion, policyMetadata: { violations: policy.violations, warnings: policy.warnings, reasons: policy.reasons } },
    });
"""
if old_submit not in text:
    raise SystemExit('P19 submit policy anchor missing')
text = text.replace(old_submit, new_submit, 1)
old_publish = """  // This endpoint is intentionally truthful until a provider-specific publisher
  // confirms the external write. It performs no state mutation and never marks
  // a reply PUBLISHED locally.
  throw new AppError({
    code: 'REVIEW_PUBLISH_NOT_AVAILABLE',
    message: 'Публикация во внешнем источнике недоступна без production provider adapter',
    statusCode: 422,
  });
"""
new_publish = """  const policy = await evaluateReplyPolicy(app.prisma, { organizationId, reviewId, text: reply.text });
  if (policy.decision === 'BLOCK') {
    throw new AppError({ code: 'REVIEW_REPLY_POLICY_BLOCKED', message: 'Ответ не прошёл политику безопасной публикации', statusCode: 422, details: policy });
  }
  return enqueueReplyPublication(app.prisma, {
    organizationId,
    reviewId,
    replyId,
    actorUserId: request.auth!.userId,
    trigger: 'manual',
  });
"""
if old_publish not in text:
    raise SystemExit('P19 publish anchor missing')
text = text.replace(old_publish, new_publish, 1)
text = text.replace("      retryCount: true,\n      failedReason: true,\n", "      retryCount: true,\n      failedReason: true,\n      origin: true,\n      generationMode: true,\n      policyDecision: true,\n      policyVersion: true,\n      policyMetadata: true,\n      providerState: true,\n      providerPolicyViolation: true,\n      lastReconciledAt: true,\n")
replies.write_text(text, encoding='utf-8')
print('patched review-replies.service.ts')

# Publish endpoint must be explicitly asynchronous.
routes = ROOT / 'backend/src/modules/reviews/reviews.routes.ts'
text = routes.read_text(encoding='utf-8')
old = """  app.post('/reviews/:reviewId/replies/:replyId/publish', { preHandler: [app.authenticate, app.authorize('reviews.approve')] }, async (request) => {
    const { reviewId, replyId } = reviewReplyIdParamsSchema.parse(request.params);
    return requestPublishReply(app, request, reviewId, replyId);
  });
"""
new = """  app.post('/reviews/:reviewId/replies/:replyId/publish', { preHandler: [app.authenticate, app.authorize('reviews.approve')] }, async (request, reply) => {
    const { reviewId, replyId } = reviewReplyIdParamsSchema.parse(request.params);
    return reply.code(202).send(await requestPublishReply(app, request, reviewId, replyId));
  });
"""
if old not in text:
    raise SystemExit('P19 reviews publish route anchor missing')
routes.write_text(text.replace(old, new, 1), encoding='utf-8')
print('patched reviews.routes.ts')

# Present enough reply state for frontend without a second query.
reviews = ROOT / 'backend/src/modules/reviews/reviews.service.ts'
text = reviews.read_text(encoding='utf-8')
text = text.replace("replies: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, text: true, status: true, publishedAt: true, createdAt: true, authorUserId: true } },", "replies: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, text: true, status: true, origin: true, generationMode: true, policyDecision: true, policyVersion: true, policyMetadata: true, providerState: true, providerPolicyViolation: true, lastReconciledAt: true, failedReason: true, publishedAt: true, createdAt: true, authorUserId: true } },")
text = text.replace("    reply: reply?.text || '',\n    replyStatus: reply?.status?.toLowerCase?.() || null,\n", "    reply: reply?.text || '',\n    replyId: reply?.id || null,\n    replyStatus: reply?.status?.toLowerCase?.() || null,\n    replyOrigin: reply?.origin?.toLowerCase?.() || null,\n    replyGenerationMode: reply?.generationMode || null,\n    replyPolicyDecision: reply?.policyDecision || null,\n    replyPolicyVersion: reply?.policyVersion || null,\n    replyPolicyMetadata: reply?.policyMetadata || null,\n    replyProviderState: reply?.providerState || null,\n    replyProviderPolicyViolation: reply?.providerPolicyViolation || null,\n    replyLastReconciledAt: reply?.lastReconciledAt?.toISOString?.() || null,\n    replyFailedReason: reply?.failedReason || null,\n")
reviews.write_text(text, encoding='utf-8')
print('patched reviews.service.ts')

print('P19 integration patch applied')
