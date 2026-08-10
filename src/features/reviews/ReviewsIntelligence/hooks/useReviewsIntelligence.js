import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useReviews from '../../hooks/useReviews';
import {
  REVIEW_RESPONSE_MODES,
  REVIEW_SENTIMENT,
  REVIEW_STATUS,
  REVIEW_WORKFLOW,
} from '../../model/reviewData';
import {
  REVIEW_SETTINGS_CHANGED_EVENT,
  approveReviewDraft,
  delegateReviewToShield,
  ensureNegativeReviewTask,
  generateAiDraft,
  getReviewSettings,
  getReviewSentiment,
  getReviewSla,
  openLegalReviewCase,
  publishThroughProvider,
  readReviewSettings,
  requestReviewDraftChanges,
  saveReviewSettings,
} from '../../../../services/reviews/reviewIntelligenceService';

function matchesFilter(review, filters, query) {
  if (filters.platform !== 'all' && review.platform !== filters.platform) return false;
  if (filters.rating !== 'all' && String(review.rating) !== String(filters.rating)) return false;
  if (filters.sentiment !== 'all' && getReviewSentiment(review) !== filters.sentiment) return false;
  if (filters.queue === 'attention') {
    const sla = getReviewSla(review);
    if (!(sla.overdue || sla.progress >= 70 || review.workflowStatus === REVIEW_WORKFLOW.APPROVAL || review.workflowStatus === REVIEW_WORKFLOW.LEGAL)) return false;
  }
  if (filters.queue === 'approval' && review.workflowStatus !== REVIEW_WORKFLOW.APPROVAL) return false;
  if (filters.queue === 'legal' && review.workflowStatus !== REVIEW_WORKFLOW.LEGAL) return false;
  if (filters.queue === 'processed' && review.workflowStatus !== REVIEW_WORKFLOW.PUBLISHED) return false;
  if (filters.queue === 'inbox' && review.status === REVIEW_STATUS.DONE) return false;

  if (!query) return true;
  const haystack = [review.author, review.text, review.platform, review.source, ...(review.tags || []), ...(review.aiReasons || [])]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export default function useReviewsIntelligence() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState(readReviewSettings);
  const [filters, setFilters] = useState(() => ({
    queue: searchParams.get('queue') || 'attention',
    platform: searchParams.get('platform') || 'all',
    rating: searchParams.get('rating') || 'all',
    sentiment: searchParams.get('sentiment') || 'all',
  }));
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const serverQuery = useMemo(() => ({
    ...(deferredQuery ? { q: deferredQuery } : {}),
    ...(filters.rating !== 'all' ? { rating: filters.rating } : {}),
    ...(filters.sentiment === REVIEW_SENTIMENT.NEGATIVE ? { maxRating: 3 } : {}),
    ...(filters.sentiment === REVIEW_SENTIMENT.POSITIVE ? { minRating: 4 } : {}),
    ...(filters.queue === 'processed' ? { workflowStatus: 'published' } : {}),
    ...(filters.queue === 'approval' ? { workflowStatus: 'awaiting_approval' } : {}),
    ...(filters.queue === 'inbox' ? { status: 'new,deferred' } : {}),
  }), [deferredQuery, filters.queue, filters.rating, filters.sentiment]);
  const reviewsState = useReviews(serverQuery);
  const { reviews, patchReview, replyToReview } = reviewsState;
  const [selectedId, setSelectedId] = useState(() => searchParams.get('review') || '');
  const [working, setWorking] = useState('');
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const handleSettings = (event) => setSettings(event.detail || readReviewSettings());
    window.addEventListener(REVIEW_SETTINGS_CHANGED_EVENT, handleSettings);
    return () => window.removeEventListener(REVIEW_SETTINGS_CHANGED_EVENT, handleSettings);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getReviewSettings({ signal: controller.signal })
      .then((next) => setSettings(next))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Negative review task creation is handled by the global Automation Engine.


  const enrichedReviews = useMemo(() => reviews.map((review) => ({
    ...review,
    sentiment: getReviewSentiment(review),
    sla: getReviewSla(review, settings),
  })), [reviews, settings]);

  const filtered = useMemo(() => enrichedReviews.filter((review) => matchesFilter(review, filters, deferredQuery)), [deferredQuery, enrichedReviews, filters]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedId('');
      return;
    }
    if (!filtered.some((item) => item.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  useEffect(() => {
    const fromUrl = searchParams.get('review');
    if (fromUrl && reviews.some((item) => item.id === fromUrl)) setSelectedId(fromUrl);
  }, [reviews, searchParams]);

  useEffect(() => {
    const platform = searchParams.get('platform');
    const queue = searchParams.get('queue');
    const rating = searchParams.get('rating');
    const sentiment = searchParams.get('sentiment');
    if (platform || queue || rating || sentiment) {
      setFilters((current) => ({
        ...current,
        ...(platform ? { platform } : {}),
        ...(queue ? { queue } : {}),
        ...(rating ? { rating } : {}),
        ...(sentiment ? { sentiment } : {}),
      }));
    }
  }, [searchParams]);

  const selectReview = useCallback((reviewId) => {
    setSelectedId(reviewId);
    const next = new URLSearchParams(searchParams);
    next.set('review', reviewId);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const selectedReview = useMemo(() => enrichedReviews.find((review) => review.id === selectedId) || null, [enrichedReviews, selectedId]);

  const metrics = useMemo(() => {
    const total = enrichedReviews.length;
    const negative = enrichedReviews.filter((review) => review.sentiment === REVIEW_SENTIMENT.NEGATIVE).length;
    const awaiting = enrichedReviews.filter((review) => review.workflowStatus === REVIEW_WORKFLOW.APPROVAL).length;
    const legal = enrichedReviews.filter((review) => review.workflowStatus === REVIEW_WORKFLOW.LEGAL).length;
    const overdue = enrichedReviews.filter((review) => review.sla.overdue).length;
    const replied = enrichedReviews.filter((review) => review.workflowStatus === REVIEW_WORKFLOW.PUBLISHED).length;
    const avg = total ? enrichedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / total : 0;
    const responseCoverage = total ? Math.round((replied / total) * 100) : 0;
    return { total, negative, awaiting, legal, overdue, average: Number(avg.toFixed(2)), responseCoverage };
  }, [enrichedReviews]);

  const reasonStats = useMemo(() => {
    const counts = new Map();
    enrichedReviews.forEach((review) => {
      (review.aiReasons || review.tags || []).forEach((reason) => counts.set(reason, (counts.get(reason) || 0) + 1));
    });
    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [enrichedReviews]);

  const platformStats = useMemo(() => ['Яндекс', '2GIS', 'Ozon', 'Отзовик', 'WB'].map((platform) => {
    const items = enrichedReviews.filter((review) => review.platform === platform);
    const average = items.length ? items.reduce((sum, review) => sum + Number(review.rating || 0), 0) / items.length : 0;
    return { platform, count: items.length, average: Number(average.toFixed(1)) };
  }), [enrichedReviews]);

  const run = useCallback(async (key, action, successMessage) => {
    setWorking(key);
    setNotice(null);
    try {
      const result = await action();
      if (successMessage) setNotice({ tone: 'success', text: successMessage });
      return result;
    } catch (error) {
      setNotice({ tone: 'danger', text: error?.message || 'Не удалось выполнить действие' });
      return null;
    } finally {
      setWorking('');
    }
  }, []);

  const generateDraft = useCallback(async (review = selectedReview) => {
    if (!review) return null;
    return run(`ai:${review.id}`, async () => {
      const draft = await generateAiDraft(review, settings);
      await replyToReview(review.id, draft.text);
      return draft;
    }, 'Черновик подготовлен');
  }, [replyToReview, run, selectedReview, settings]);

  const saveDraft = useCallback(async (text) => {
    if (!selectedReview) return;
    return run(`draft:${selectedReview.id}`, async () => {
      return replyToReview(selectedReview.id, text);
    }, 'Черновик сохранён');
  }, [replyToReview, run, selectedReview]);

  const delegateToShield = useCallback((note = '') => selectedReview && run(`shield:${selectedReview.id}`, () => delegateReviewToShield(selectedReview.id, note), 'Отзыв передан команде Бизнес Щит'), [run, selectedReview]);

  const submitReply = useCallback(async (text) => {
    if (!selectedReview) return;
    const value = String(text || '').trim();
    if (!value) throw new Error('Напишите ответ');
    return saveDraft(value);
  }, [saveDraft, selectedReview]);

  const approve = useCallback(() => selectedReview && run(`approve:${selectedReview.id}`, () => approveReviewDraft(selectedReview.id), 'Ответ согласован'), [run, selectedReview]);
  const requestChanges = useCallback((note) => selectedReview && run(`changes:${selectedReview.id}`, () => requestReviewDraftChanges(selectedReview.id, note), 'Ответ возвращён на доработку'), [run, selectedReview]);
  const publishApproved = useCallback(() => selectedReview && run(`publish:${selectedReview.id}`, () => publishThroughProvider(selectedReview, selectedReview.reply), 'Согласованный ответ опубликован'), [run, selectedReview]);
  const escalateLegal = useCallback((payload) => selectedReview && run(`legal:${selectedReview.id}`, () => openLegalReviewCase(selectedReview.id, payload), 'Отзыв передан на юридическую проверку'), [run, selectedReview]);
  const ensureTask = useCallback(() => selectedReview && run(`task:${selectedReview.id}`, async () => {
    const taskId = await ensureNegativeReviewTask(selectedReview);
    if (!taskId) throw new Error('Для этого отзыва автоматическая задача не требуется');
    return taskId;
  }, 'Задача связана с отзывом'), [run, selectedReview]);

  const updateSettings = useCallback(async (patch) => {
    const next = await saveReviewSettings(patch);
    setSettings(next);
    return next;
  }, []);

  const responseMode = REVIEW_RESPONSE_MODES.find((item) => item.id === settings.responseMode) || REVIEW_RESPONSE_MODES[0];

  return {
    ...reviewsState,
    reviews: enrichedReviews,
    filtered,
    selectedReview,
    selectedId,
    selectReview,
    filters,
    setFilters,
    query,
    setQuery,
    metrics,
    reasonStats,
    platformStats,
    settings,
    updateSettings,
    responseMode,
    working,
    notice,
    setNotice,
    generateDraft,
    saveDraft,
    submitReply,
    delegateToShield,
    approve,
    requestChanges,
    publishApproved,
    escalateLegal,
    ensureTask,
    patchReview,
  };
}
