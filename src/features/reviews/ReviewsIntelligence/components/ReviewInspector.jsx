import React, { memo, useEffect, useMemo, useState } from 'react';
import { REVIEW_RESPONSE_MODES, REVIEW_SENTIMENT, REVIEW_WORKFLOW } from '../../model/reviewData';

const WORKFLOW_LABEL = {
  [REVIEW_WORKFLOW.INBOX]: 'Новый отзыв',
  [REVIEW_WORKFLOW.DRAFT]: 'Черновик',
  [REVIEW_WORKFLOW.APPROVAL]: 'На согласовании',
  [REVIEW_WORKFLOW.APPROVED]: 'Согласован',
  [REVIEW_WORKFLOW.SHIELD]: 'У Бизнес Щит',
  [REVIEW_WORKFLOW.PUBLISHED]: 'Опубликован',
  [REVIEW_WORKFLOW.LEGAL]: 'Юридическая проверка',
};

const AI_MODES = [
  { id: 'CONCISE', label: 'Кратко' },
  { id: 'EMPATHETIC', label: 'Эмпатично' },
  { id: 'FORMAL', label: 'Формально' },
  { id: 'RECOVERY_FOCUSED', label: 'Восстановить доверие' },
];

function StarRow({ rating }) {
  return (
    <span className="reviews-inspector__stars" aria-label={`${rating} из 5`}>
      {Array.from({ length: 5 }).map((_, index) => <i key={index} className={index < rating ? 'is-filled' : ''}>★</i>)}
    </span>
  );
}

function ReviewInspector({
  review,
  settings,
  canReply,
  canApprove,
  working,
  onGenerate,
  onSaveDraft,
  onSubmit,
  onApprove,
  onRequestChanges,
  onPublishApproved,
  canReanalyze = false,
  onReanalyze,
}) {
  const [reply, setReply] = useState('');
  const [changesNote, setChangesNote] = useState('');
  const [generationMode, setGenerationMode] = useState('EMPATHETIC');

  useEffect(() => {
    setReply(review?.reply || '');
    setChangesNote(review?.approval?.note || '');
  }, [review?.id, review?.reply, review?.approval?.note]);

  const mode = useMemo(() => REVIEW_RESPONSE_MODES.find((item) => item.id === settings.responseMode) || REVIEW_RESPONSE_MODES[0], [settings.responseMode]);
  const isPublished = review?.workflowStatus === REVIEW_WORKFLOW.PUBLISHED;
  const isApproval = review?.workflowStatus === REVIEW_WORKFLOW.APPROVAL;
  const isApproved = review?.workflowStatus === REVIEW_WORKFLOW.APPROVED;
  const isLegal = review?.workflowStatus === REVIEW_WORKFLOW.LEGAL;
  const negative = review?.sentiment === REVIEW_SENTIMENT.NEGATIVE;
  const publishing = ['publish_queued', 'publishing'].includes(review?.replyStatus);
  const publishUnknown = review?.replyStatus === 'publish_unknown';
  const publishFailed = review?.replyStatus === 'publish_failed';
  const policyBlocked = review?.replyPolicyDecision === 'BLOCK';

  if (!review) {
    return (
      <section className="reviews-intel__inspector reviews-intel__inspector--empty">
        <div><span>✓</span><strong>Выберите отзыв</strong><p>Здесь появятся контекст, AI-черновик и рабочие действия.</p></div>
      </section>
    );
  }

  return (
    <section className="reviews-intel__inspector" aria-label="Работа с отзывом">
      <header className="reviews-inspector__hero">
        <div className="reviews-inspector__heroTop">
          <span className={`reviews-inspector__sentiment is-${review.sentiment}`}>
            <i />{negative ? 'Негатив' : review.sentiment === REVIEW_SENTIMENT.NEUTRAL ? 'Нейтрально' : 'Позитив'}
          </span>
          <span className={`reviews-inspector__workflow is-${review.workflowStatus}`}>{WORKFLOW_LABEL[review.workflowStatus] || 'В работе'}</span>
        </div>
        <div className="reviews-inspector__author">
          <span className={`reviews-inspector__avatar is-${review.sentiment}`}>{review.initials}</span>
          <div>
            <strong>{review.author}</strong>
            <span>{review.platform} · {review.source}</span>
          </div>
          <div className="reviews-inspector__score"><StarRow rating={review.rating} /><strong>{review.rating}.0</strong></div>
        </div>
        <blockquote>{review.text}</blockquote>
        <div className="reviews-inspector__chips">
          {(review.aiReasons || review.tags || []).map((tag) => <span key={tag}>{tag}</span>)}
          <em>{review.date} · {review.time}</em>
        </div>
      </header>

      {isLegal ? (
        <section className="reviews-inspector__legalState">
          <div className="reviews-inspector__legalIcon">§</div>
          <div>
            <span>LEGAL REVIEW</span>
            <h3>Отзыв на юридической проверке</h3>
            <p>{review.legalCase?.reason || 'Спорный отзыв передан на предварительную оценку.'}</p>
            <ul>
              <li><i className="is-done">✓</i>Отзыв и площадка зафиксированы</li>
              <li><i className="is-done">✓</i>Собираем доказательства и контекст</li>
              <li><i>3</i>Проверка оснований для обращения к площадке</li>
              <li><i>4</i>Контроль результата</li>
            </ul>
          </div>
        </section>
      ) : null}

      <section className="reviews-inspector__aiIntel" aria-label="Shield AI Intelligence">
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
        <div className="reviews-copilot__head">
          <div>
            <span>AI REPLY COPILOT</span>
            <h3>Ответ компании</h3>
            <p>{mode.label} · Brand Voice применяется на сервере</p>
          </div>
          <button type="button" className="reviews-copilot__generate" onClick={() => onGenerate(generationMode)} disabled={!canReply || working.startsWith('ai:') || review.intelligence?.status !== 'AVAILABLE'}>
            <span>✦</span>{working.startsWith('ai:') ? 'Генерируем…' : reply ? 'Переписать AI' : 'Создать AI-черновик'}
          </button>
        </div>

        <div className="reviews-copilot__modes" role="group" aria-label="Стиль AI-ответа">
          {AI_MODES.map((item) => <button key={item.id} type="button" className={generationMode === item.id ? 'is-active' : ''} onClick={() => setGenerationMode(item.id)} disabled={Boolean(working)}>{item.label}</button>)}
        </div>

        <label className="reviews-copilot__editor">
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder="Подготовьте ответ или создайте AI-черновик…"
            rows={8}
            maxLength={1400}
            readOnly={!canReply || isPublished || publishing || publishUnknown}
          />
          <span>{reply.length}/1400</span>
        </label>

        {review.replyOrigin ? (
          <div className="reviews-copilot__meta">
            <span>✦ Источник: {review.replyOrigin === 'ai' ? 'AI Copilot' : review.replyOrigin === 'ai_edited' ? 'AI + редактура' : review.replyOrigin === 'autopilot' ? 'Autopilot' : 'ручной ответ'}</span>
            {review.replyPolicyDecision ? <span>Policy: {review.replyPolicyDecision}</span> : <span>Проверьте факты перед публикацией</span>}
          </div>
        ) : null}

        {policyBlocked ? <div className="reviews-ai-state is-danger"><strong>Публикация заблокирована политикой</strong><span>Измените текст ответа и отправьте новую версию на проверку.</span></div> : null}
        {publishUnknown ? <div className="reviews-ai-state is-warning"><strong>Проверяем статус публикации</strong><span>Площадка не подтвердила результат однозначно. Business Shield выполняет reconciliation и не отправляет ответ повторно вслепую.</span></div> : null}
        {publishFailed ? <div className="reviews-ai-state is-danger"><strong>Публикация не выполнена</strong><span>{review.replyFailedReason || 'Площадка отклонила операцию или ответ не найден после проверки.'}</span></div> : null}
        {review.replyProviderState && !isPublished ? <div className="reviews-copilot__meta"><span>Статус площадки: {review.replyProviderState}</span></div> : null}

        <div className="reviews-copilot__actions">
          {!isPublished && !isApproval && !isApproved && !publishing && !publishUnknown ? (
            <>
              <button type="button" onClick={() => onSaveDraft(reply)} disabled={!canReply || !reply.trim() || Boolean(working)}>Сохранить черновик</button>
              <button type="button" className="is-primary" onClick={() => onSubmit(reply)} disabled={!canReply || !reply.trim() || Boolean(working) || policyBlocked}>Отправить на согласование</button>
            </>
          ) : null}

          {isApproval ? (
            canApprove ? (
              <div className="reviews-approval-box">
                <div><span>APPROVAL</span><strong>Ответ ждёт решения руководителя</strong><small>Можно согласовать или вернуть исполнителю с комментарием.</small></div>
                <textarea value={changesNote} onChange={(event) => setChangesNote(event.target.value)} rows={2} placeholder="Комментарий к доработке (необязательно)" />
                <div>
                  <button type="button" onClick={() => onRequestChanges(changesNote)} disabled={Boolean(working)}>Вернуть на доработку</button>
                  <button type="button" className="is-primary" onClick={onApprove} disabled={Boolean(working)}>Согласовать</button>
                </div>
              </div>
            ) : (
              <div className="reviews-copilot__waiting"><i />Ответ отправлен руководителю. Публикация станет доступна после согласования.</div>
            )
          ) : null}

          {isApproved ? (
            <div className="reviews-copilot__approved">
              <div><span>✓</span><div><strong>{publishing ? 'Публикация выполняется' : publishUnknown ? 'Проверяем публикацию' : publishFailed ? 'Нужна повторная публикация' : 'Ответ согласован'}</strong><small>{publishing ? 'Запрос выполняется в фоне' : publishUnknown ? 'Не отправляем повторно до reconciliation' : publishFailed ? 'Можно повторить после проверки причины' : `Готов к отправке в ${review.platform}`}</small></div></div>
              <button type="button" className="is-primary" onClick={onPublishApproved} disabled={!canApprove || Boolean(working) || publishing || publishUnknown || policyBlocked}>{working.startsWith('publish:') ? 'Ставим в очередь…' : publishFailed ? 'Повторить публикацию' : 'Опубликовать'}</button>
            </div>
          ) : null}

          {isPublished ? (
            <div className="reviews-copilot__published"><span>✓</span><div><strong>Ответ опубликован</strong><small>{review.repliedAt ? new Date(review.repliedAt).toLocaleString('ru-RU') : 'Площадка подтвердила публикацию'}</small></div></div>
          ) : null}
        </div>
      </section>

      <section className="reviews-inspector__history">
        <div className="reviews-inspector__sectionTitle"><span>WORKFLOW</span><strong>История обработки</strong></div>
        <div className="reviews-workflow-timeline">
          <div className="is-done"><i>✓</i><div><strong>Отзыв получен</strong><span>{review.platform} · {review.date}, {review.time}</span></div></div>
          {review.replyOrigin === 'ai' || review.replyOrigin === 'autopilot' || review.replyOrigin === 'ai_edited' ? <div className="is-done"><i>✓</i><div><strong>Создан AI-черновик</strong><span>{review.replyGenerationMode || 'AI Reply Copilot'}</span></div></div> : null}
          {isApproval ? <div className="is-current"><i>2</i><div><strong>Согласование</strong><span>Ожидает руководителя</span></div></div> : null}
          {isApproved && !isPublished ? <div className="is-current"><i>3</i><div><strong>Публикация</strong><span>{publishing ? 'Выполняется' : publishUnknown ? 'Проверяется' : publishFailed ? 'Требует повторной попытки' : 'Готова к запуску'}</span></div></div> : null}
          {review.legalCase ? <div className="is-current"><i>§</i><div><strong>Юридическая проверка</strong><span>{review.legalCase.reason}</span></div></div> : null}
          {isPublished ? <div className="is-done"><i>✓</i><div><strong>Ответ опубликован</strong><span>{review.replyProviderState ? `Площадка: ${review.replyProviderState}` : 'Площадка подтвердила результат'}</span></div></div> : null}
        </div>
      </section>
    </section>
  );
}

export default memo(ReviewInspector);
