#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P18 patch anchor not found: {path}\n{old[:400]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')


patch('backend/prisma/schema.prisma', '''enum JobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  DEAD

  @@map("job_status")
}
''', '''enum JobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  DEAD

  @@map("job_status")
}

enum ReviewSentiment {
  POSITIVE
  NEUTRAL
  NEGATIVE
  MIXED

  @@map("review_sentiment")
}

enum AiOperationStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  SKIPPED

  @@map("ai_operation_status")
}
''')

patch('backend/prisma/schema.prisma', '''  reviewReplies          ReviewReply[]
  reviewAssignments      ReviewAssignment[]
  tasks                  Task[]
''', '''  reviewReplies          ReviewReply[]
  reviewAssignments      ReviewAssignment[]
  reviewInsights         ReviewInsight[]
  aiOperations           AiOperation[]
  tasks                  Task[]
''')

patch('backend/prisma/schema.prisma', '''  replies      ReviewReply[]
  assignments  ReviewAssignment[]
  tasks        Task[]
''', '''  replies       ReviewReply[]
  assignments   ReviewAssignment[]
  insights      ReviewInsight[]
  aiOperations  AiOperation[]
  tasks         Task[]
''')

patch('backend/prisma/schema.prisma', '''model ReviewTag {
''', '''model ReviewInsight {
  id                            String          @id @default(uuid()) @db.Uuid
  organizationId                String          @map("organization_id") @db.Uuid
  reviewId                      String          @map("review_id") @db.Uuid
  analysisVersion               Int             @default(1) @map("analysis_version")
  inputHash                     String          @map("input_hash") @db.VarChar(128)
  sentiment                     ReviewSentiment
  operationalUrgency            Int             @map("operational_urgency")
  reputationRisk                Int             @map("reputation_risk")
  churnRisk                     Int?            @map("churn_risk")
  churnRiskConfidence           Float?          @map("churn_risk_confidence")
  churnRiskInsufficientEvidence Boolean         @default(false) @map("churn_risk_insufficient_evidence")
  legalPrRisk                   Boolean         @default(false) @map("legal_pr_risk")
  legalPrRiskReason             String?         @map("legal_pr_risk_reason") @db.Text
  safetyRisk                    Boolean         @default(false) @map("safety_risk")
  safetyRiskReason              String?         @map("safety_risk_reason") @db.Text
  spamSignalProbability         Float?          @map("spam_signal_probability")
  coordinatedSignalProbability  Float?          @map("coordinated_signal_probability")
  signalReasons                 Json            @default("[]") @map("signal_reasons")
  rootCauseHypothesis           String?         @map("root_cause_hypothesis") @db.Text
  observedFacts                 Json            @default("[]") @map("observed_facts")
  inferences                    Json            @default("[]")
  recommendations               Json            @default("[]")
  confidence                    Float
  provider                      String          @db.VarChar(80)
  model                         String          @db.VarChar(120)
  modelVersion                  String?         @map("model_version") @db.VarChar(80)
  promptVersion                 String          @map("prompt_version") @db.VarChar(80)
  createdAt                     DateTime        @default(now()) @map("created_at")
  updatedAt                     DateTime        @updatedAt @map("updated_at")

  organization Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  review       Review                @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  aspects      ReviewInsightAspect[]
  operations   AiOperation[]

  @@index([organizationId, reviewId, createdAt], map: "review_insights_org_review_created_idx")
  @@index([organizationId, sentiment, createdAt], map: "review_insights_org_sentiment_created_idx")
  @@index([reviewId, analysisVersion], map: "review_insights_review_version_idx")
  @@map("review_insights")
}

model ReviewInsightAspect {
  id         String          @id @default(uuid()) @db.Uuid
  insightId  String          @map("insight_id") @db.Uuid
  aspect     String          @db.VarChar(80)
  sentiment  ReviewSentiment
  confidence Float
  evidence   String          @default("") @db.Text
  createdAt  DateTime        @default(now()) @map("created_at")

  insight ReviewInsight @relation(fields: [insightId], references: [id], onDelete: Cascade)

  @@index([insightId, confidence], map: "review_insight_aspects_insight_confidence_idx")
  @@map("review_insight_aspects")
}

model AiOperation {
  id                  String            @id @default(uuid()) @db.Uuid
  organizationId      String            @map("organization_id") @db.Uuid
  reviewId            String?           @map("review_id") @db.Uuid
  insightId           String?           @map("insight_id") @db.Uuid
  operationType       String            @map("operation_type") @db.VarChar(80)
  provider            String            @db.VarChar(80)
  model               String            @db.VarChar(120)
  modelVersion        String?           @map("model_version") @db.VarChar(80)
  promptVersion       String            @map("prompt_version") @db.VarChar(80)
  inputHash           String            @map("input_hash") @db.VarChar(128)
  outputHash          String?           @map("output_hash") @db.VarChar(128)
  status              AiOperationStatus @default(QUEUED)
  startedAt           DateTime?         @map("started_at")
  completedAt         DateTime?         @map("completed_at")
  latencyMs           Int?              @map("latency_ms")
  inputTokens         Int?              @map("input_tokens")
  outputTokens        Int?              @map("output_tokens")
  estimatedCostMicros Int?              @map("estimated_cost_micros")
  confidence          Float?
  moderationResult    Json?             @map("moderation_result")
  errorCode           String?           @map("error_code") @db.VarChar(120)
  errorMessage        String?           @map("error_message") @db.Text
  createdAt           DateTime          @default(now()) @map("created_at")
  updatedAt           DateTime          @updatedAt @map("updated_at")

  organization Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  review       Review?        @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  insight      ReviewInsight? @relation(fields: [insightId], references: [id], onDelete: SetNull)

  @@index([organizationId, status, createdAt], map: "ai_operations_org_status_created_idx")
  @@index([reviewId, createdAt], map: "ai_operations_review_created_idx")
  @@index([reviewId, inputHash, promptVersion, model], map: "ai_operations_input_idx")
  @@map("ai_operations")
}

model ReviewTag {
''')

patch('backend/src/config/env.ts', '''    GOOGLE_BUSINESS_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  })
''', '''    GOOGLE_BUSINESS_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),

    AI_REVIEW_INTELLIGENCE_ENABLED: booleanFromString.default(false),
    AI_OPENAI_API_KEY: z.string().default(''),
    AI_OPENAI_MODEL: z.string().default(''),
    AI_OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    AI_OPENAI_INPUT_COST_MICROS_PER_MILLION_TOKENS: z.coerce.number().int().min(0).default(0),
    AI_OPENAI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: z.coerce.number().int().min(0).default(0),
  })
''')

patch('backend/src/config/env.ts', '''    if (value.GOOGLE_BUSINESS_ENABLED) {
''', '''    if (value.AI_REVIEW_INTELLIGENCE_ENABLED) {
      if (!value.AI_OPENAI_API_KEY) {
        ctx.addIssue({ code: 'custom', path: ['AI_OPENAI_API_KEY'], message: 'AI Review Intelligence requires an AI provider API key' });
      }
      if (!value.AI_OPENAI_MODEL) {
        ctx.addIssue({ code: 'custom', path: ['AI_OPENAI_MODEL'], message: 'AI Review Intelligence requires an explicit model' });
      }
    }

    if (value.GOOGLE_BUSINESS_ENABLED) {
''')

patch('backend/.env.example', '''GOOGLE_BUSINESS_TIMEOUT_MS=10000
''', '''GOOGLE_BUSINESS_TIMEOUT_MS=10000

# Shield AI Review Intelligence. Disabled until a real provider key/model are configured.
AI_REVIEW_INTELLIGENCE_ENABLED=false
AI_OPENAI_API_KEY=
AI_OPENAI_MODEL=
AI_OPENAI_TIMEOUT_MS=30000
# Optional cost accounting rates. Set to 0 if pricing is not configured.
AI_OPENAI_INPUT_COST_MICROS_PER_MILLION_TOKENS=0
AI_OPENAI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS=0
''')

patch('backend/src/core/rbac/permissions.ts', '''  'reviews.settings',
  'tasks.view',
''', '''  'reviews.settings',
  'reviews.intelligence.read',
  'reviews.intelligence.reanalyze',
  'tasks.view',
''')
patch('backend/src/core/rbac/permissions.ts', '''  'reviews.view',
  'tasks.view',
''', '''  'reviews.view',
  'reviews.intelligence.read',
  'tasks.view',
''')
patch('backend/src/core/rbac/permissions.ts', '''  'reviews.view', 'reviews.reply', 'reviews.moderate', 'reviews.legal',
''', '''  'reviews.view', 'reviews.reply', 'reviews.moderate', 'reviews.legal', 'reviews.intelligence.read', 'reviews.intelligence.reanalyze',
''')
patch('backend/src/core/rbac/permissions.ts', '''  'reviews.view', 'reviews.reply',
  'tasks.view', 'tasks.create', 'tasks.edit',
''', '''  'reviews.view', 'reviews.reply', 'reviews.intelligence.read',
  'tasks.view', 'tasks.create', 'tasks.edit',
''')

patch('backend/src/app.ts', '''import { adminRoutes } from './modules/admin/admin.routes.js';
''', '''import { adminRoutes } from './modules/admin/admin.routes.js';
import { reviewIntelligenceRoutes } from './modules/ai/review-intelligence.routes.js';
import { registerAiProviders } from './modules/ai/providers/index.js';
''')
patch('backend/src/app.ts', '''  registerGoogleBusinessProfileProvider();
''', '''  registerGoogleBusinessProfileProvider();
  registerAiProviders();
''')
patch('backend/src/app.ts', '''          '*.GOOGLE_BUSINESS_CLIENT_SECRET',
''', '''          '*.GOOGLE_BUSINESS_CLIENT_SECRET',
          '*.AI_OPENAI_API_KEY',
''')
patch('backend/src/app.ts', '''  await app.register(reviewsRoutes, { prefix: '/api/v1' });
''', '''  await app.register(reviewsRoutes, { prefix: '/api/v1' });
  await app.register(reviewIntelligenceRoutes, { prefix: '/api/v1' });
''')

patch('backend/src/worker.ts', '''import { registerGoogleBusinessProfileProvider } from './modules/integrations/providers/google/index.js';

registerGoogleBusinessProfileProvider();
''', '''import { registerGoogleBusinessProfileProvider } from './modules/integrations/providers/google/index.js';
import { processReviewAnalysisJob } from './modules/ai/review-intelligence.service.js';
import { registerAiProviders } from './modules/ai/providers/index.js';

registerGoogleBusinessProfileProvider();
registerAiProviders();
''')
patch('backend/src/worker.ts', '''async function processJob(job: any) {
  if (job.type === 'integration.sync.reviews') return processIntegrationSync(job.payload);
  if (job.type === 'report.generate') return processReport(job.payload);
''', '''async function processJob(job: any) {
  if (job.type === 'integration.sync.reviews') return processIntegrationSync(job.payload);
  if (job.type === 'ai.analyzeReview') {
    const organizationId = String(job.payload?.organizationId || '');
    const reviewId = String(job.payload?.reviewId || '');
    const aiOperationId = String(job.payload?.aiOperationId || '');
    if (!organizationId || !reviewId || !aiOperationId) throw new Error('INVALID_AI_REVIEW_JOB');
    return processReviewAnalysisJob(prisma, { organizationId, reviewId, aiOperationId });
  }
  if (job.type === 'report.generate') return processReport(job.payload);
''')
patch('backend/src/worker.ts', '''  const exhausted = job.attempts >= job.maxAttempts;
''', '''  const explicitlyNonRetryable = Boolean(error && typeof error === 'object' && 'retryable' in error && (error as { retryable?: boolean }).retryable === false);
  const exhausted = explicitlyNonRetryable || job.attempts >= job.maxAttempts;
''')

patch('backend/src/modules/integrations/review-ingestion.service.ts', '''import type { ProviderConnectionContext, ProviderReviewRecord } from './providers/provider.types.js';
''', '''import type { ProviderConnectionContext, ProviderReviewRecord } from './providers/provider.types.js';
import { enqueueReviewAnalysis } from '../ai/review-intelligence.service.js';
''')
patch('backend/src/modules/integrations/review-ingestion.service.ts', '''  record: ProviderReviewRecord,
): Promise<{ disposition: IngestionDisposition; sourceId: string }> {
''', '''  record: ProviderReviewRecord,
): Promise<{ disposition: IngestionDisposition; sourceId: string; reviewId: string }> {
''')
patch('backend/src/modules/integrations/review-ingestion.service.ts', '''  await prisma.$transaction(async (tx) => {
    const author = await tx.reviewAuthor.upsert({
''', '''  let persistedReviewId = existing?.id ?? '';
  await prisma.$transaction(async (tx) => {
    const author = await tx.reviewAuthor.upsert({
''')
patch('backend/src/modules/integrations/review-ingestion.service.ts', '''    if (!existing) {
      await tx.review.create({
        data: {
''', '''    if (!existing) {
      const createdReview = await tx.review.create({
        data: {
''')
patch('backend/src/modules/integrations/review-ingestion.service.ts', '''          metadata: providerMetadata(null, account, syncRunId, disposition, record),
        },
      });
      return;
''', '''          metadata: providerMetadata(null, account, syncRunId, disposition, record),
        },
      });
      persistedReviewId = createdReview.id;
      return;
''')
patch('backend/src/modules/integrations/review-ingestion.service.ts', '''  return { disposition, sourceId: source.id };
}
''', '''  return { disposition, sourceId: source.id, reviewId: persistedReviewId };
}
''')
patch('backend/src/modules/integrations/review-ingestion.service.ts', '''        if (result.disposition === 'imported') counters.imported += 1;
        else if (result.disposition === 'updated') counters.updated += 1;
        else counters.skipped += 1;
''', '''        if (result.disposition === 'imported') counters.imported += 1;
        else if (result.disposition === 'updated') counters.updated += 1;
        else counters.skipped += 1;

        if (result.disposition === 'imported' || result.disposition === 'updated') {
          await enqueueReviewAnalysis(prisma, {
            organizationId: account.organizationId,
            reviewId: result.reviewId,
          }).catch(() => ({ queued: false as const, reason: 'AI_ENQUEUE_FAILED' }));
        }
''')

patch('src/features/reviews/ReviewsIntelligence/hooks/useReviewsIntelligence.js', '''import {
  REVIEW_SETTINGS_CHANGED_EVENT,
''', '''import { getReviewIntelligence, reanalyzeReview } from '../../../../services/reviews/reviewInsightService';
import {
  REVIEW_SETTINGS_CHANGED_EVENT,
''')
patch('src/features/reviews/ReviewsIntelligence/hooks/useReviewsIntelligence.js', '''  const [working, setWorking] = useState('');
  const [notice, setNotice] = useState(null);
''', '''  const [working, setWorking] = useState('');
  const [notice, setNotice] = useState(null);
  const [insightState, setInsightState] = useState(null);
''')
patch('src/features/reviews/ReviewsIntelligence/hooks/useReviewsIntelligence.js', '''  const selectedReview = useMemo(() => enrichedReviews.find((review) => review.id === selectedId) || null, [enrichedReviews, selectedId]);
''', '''  useEffect(() => {
    if (!selectedId) {
      setInsightState(null);
      return undefined;
    }
    const controller = new AbortController();
    setInsightState({ status: 'LOADING', insight: null, reviewId: selectedId });
    getReviewIntelligence(selectedId, { signal: controller.signal })
      .then((state) => setInsightState({ ...state, reviewId: selectedId }))
      .catch((error) => {
        if (error?.name !== 'AbortError') setInsightState({ status: 'FAILED', insight: null, reviewId: selectedId, error: error?.message || 'AI-анализ недоступен' });
      });
    return () => controller.abort();
  }, [selectedId]);

  const selectedReview = useMemo(() => {
    const review = enrichedReviews.find((item) => item.id === selectedId) || null;
    if (!review) return null;
    return { ...review, intelligence: insightState?.reviewId === review.id ? insightState : null };
  }, [enrichedReviews, insightState, selectedId]);
''')
patch('src/features/reviews/ReviewsIntelligence/hooks/useReviewsIntelligence.js', '''  const updateSettings = useCallback(async (patch) => {
''', '''  const reanalyzeIntelligence = useCallback(async () => {
    if (!selectedReview) return null;
    return run(`intelligence:${selectedReview.id}`, async () => {
      const queued = await reanalyzeReview(selectedReview.id);
      setInsightState((current) => ({ ...(current || {}), reviewId: selectedReview.id, status: 'QUEUED', operation: { id: queued?.operationId || null, status: 'QUEUED' } }));
      return queued;
    }, 'AI-анализ поставлен в очередь');
  }, [run, selectedReview]);

  const updateSettings = useCallback(async (patch) => {
''')
patch('src/features/reviews/ReviewsIntelligence/hooks/useReviewsIntelligence.js', '''    ensureTask,
    patchReview,
''', '''    ensureTask,
    reanalyzeIntelligence,
    patchReview,
''')

patch('src/features/reviews/ReviewsIntelligence/ReviewsIntelligenceWorkspace.jsx', '''  const canApprove = access.can('reviews.approve');
''', '''  const canApprove = access.can('reviews.approve');
  const canReanalyze = access.can('reviews.intelligence.reanalyze');
''')
patch('src/features/reviews/ReviewsIntelligence/ReviewsIntelligenceWorkspace.jsx', '''            onPublishApproved={intelligence.publishApproved}
          />
''', '''            onPublishApproved={intelligence.publishApproved}
            canReanalyze={canReanalyze}
            onReanalyze={intelligence.reanalyzeIntelligence}
          />
''')

patch('src/features/reviews/ReviewsIntelligence/components/ReviewInspector.jsx', '''  onPublishApproved,
}) {
''', '''  onPublishApproved,
  canReanalyze = false,
  onReanalyze,
}) {
''')
patch('src/features/reviews/ReviewsIntelligence/components/ReviewInspector.jsx', '''      <section className="reviews-copilot">
''', '''      <section className="reviews-inspector__aiIntel" aria-label="Shield AI Intelligence">
        <div className="reviews-inspector__sectionTitle"><span>SHIELD AI</span><strong>Анализ отзыва</strong></div>
        {!review.intelligence || review.intelligence.status === 'LOADING' ? <p>Загружаем AI-анализ…</p> : null}
        {review.intelligence?.status === 'QUEUED' || review.intelligence?.status === 'ANALYZING' ? <p>AI-анализ выполняется в фоне. Отзыв уже доступен для работы.</p> : null}
        {review.intelligence?.status === 'UNAVAILABLE' ? <div className="reviews-ai-state is-muted"><strong>AI-анализ пока недоступен</strong><span>{review.intelligence.providerState?.reasonMessage || 'Провайдер не настроен.'}</span></div> : null}
        {review.intelligence?.status === 'FAILED' ? <div className="reviews-ai-state is-danger"><strong>Не удалось выполнить AI-анализ</strong><span>{review.intelligence.error || review.intelligence.operation?.errorCode || 'Попробуйте повторить анализ.'}</span></div> : null}
        {review.intelligence?.status === 'STALE' ? <div className="reviews-ai-state is-warning"><strong>Анализ устарел</strong><span>Текст отзыва изменился после последнего анализа.</span></div> : null}
        {review.intelligence?.insight ? (
          <div className="reviews-ai-grid">
            <div><span>Тональность</span><strong>{review.intelligence.insight.sentiment}</strong></div>
            <div><span>Срочность</span><strong>{review.intelligence.insight.operationalUrgency}/100</strong></div>
            <div><span>Репутационный риск</span><strong>{review.intelligence.insight.reputationRisk}/100</strong></div>
            <div><span>Уверенность</span><strong>{review.intelligence.insight.confidence >= 0.8 ? 'Высокая' : review.intelligence.insight.confidence >= 0.55 ? 'Средняя' : 'Низкая'}</strong></div>
            {review.intelligence.insight.aspects?.length ? <div className="reviews-ai-grid__wide"><span>Аспекты</span><div className="reviews-inspector__chips">{review.intelligence.insight.aspects.map((item) => <span key={`${item.aspect}-${item.sentiment}`}>{item.aspect}</span>)}</div></div> : null}
            {review.intelligence.insight.legalPrRisk ? <div className="reviews-ai-grid__wide is-risk"><strong>Потенциальный юридический / PR-риск</strong><span>{review.intelligence.insight.legalPrRiskReason || 'Требуется проверка человеком.'}</span></div> : null}
            {review.intelligence.insight.safetyRisk ? <div className="reviews-ai-grid__wide is-risk"><strong>Safety-сигнал</strong><span>{review.intelligence.insight.safetyRiskReason || 'Требуется приоритетная проверка.'}</span></div> : null}
            {review.intelligence.insight.observedFacts?.length ? <div className="reviews-ai-grid__wide"><span>Что сообщил клиент</span><ul>{review.intelligence.insight.observedFacts.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
            {review.intelligence.insight.inferences?.length ? <div className="reviews-ai-grid__wide"><span>Возможные причины</span><ul>{review.intelligence.insight.inferences.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
            {review.intelligence.insight.recommendations?.length ? <div className="reviews-ai-grid__wide"><span>Что проверить</span><ul>{review.intelligence.insight.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
          </div>
        ) : null}
        {canReanalyze && onReanalyze && !['QUEUED', 'ANALYZING'].includes(review.intelligence?.status) ? <button type="button" className="reviews-copilot__generate" onClick={onReanalyze} disabled={working.startsWith('intelligence:')}>{working.startsWith('intelligence:') ? 'Ставим в очередь…' : 'Повторить AI-анализ'}</button> : null}
      </section>

      <section className="reviews-copilot">
''')

scss = ROOT / 'src/features/reviews/ReviewsIntelligence/ReviewsIntelligenceWorkspace.scss'
text = scss.read_text(encoding='utf-8')
marker = '/* P18 Shield AI Review Intelligence */'
if marker not in text:
    text += '''\n\n/* P18 Shield AI Review Intelligence */
.reviews-inspector__aiIntel { margin: 18px 0; padding: 18px; border: 1px solid var(--border-color, rgba(127,127,127,.2)); border-radius: 16px; }
.reviews-ai-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; margin-top: 12px; }
.reviews-ai-grid > div { padding: 12px; border-radius: 12px; background: rgba(127,127,127,.07); display: flex; flex-direction: column; gap: 5px; }
.reviews-ai-grid__wide { grid-column: 1 / -1; }
.reviews-ai-grid .is-risk { border: 1px solid rgba(220,70,70,.28); }
.reviews-ai-grid ul { margin: 4px 0 0 18px; padding: 0; }
.reviews-ai-state { display: flex; flex-direction: column; gap: 4px; margin: 10px 0; padding: 12px; border-radius: 12px; background: rgba(127,127,127,.07); }
.reviews-ai-state.is-danger, .reviews-ai-state.is-warning { border: 1px solid rgba(220,110,70,.3); }
@media (max-width: 680px) { .reviews-ai-grid { grid-template-columns: 1fr; } .reviews-ai-grid__wide { grid-column: auto; } }
'''
    scss.write_text(text, encoding='utf-8')
    print('patched SCSS')

print('P18 integration patch applied')
