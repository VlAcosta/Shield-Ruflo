import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  closeReputationCase,
  createCaseTask,
  createReputationCase,
  listReputationCases,
  reopenReputationCase,
  transitionReputationCase,
  verifyReputationCase,
} from '../../services/cases/casesService';
import './CasesWorkspace.scss';

const STATUS_LABELS = {
  new: 'Новый',
  triaged: 'Триаж',
  assigned: 'Назначен',
  in_progress: 'В работе',
  waiting_customer: 'Ждём клиента',
  waiting_internal: 'Ждём команду',
  resolved: 'Решён',
  verified: 'Проверен',
  closed: 'Закрыт',
};

const SEVERITY_LABELS = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

const NEXT_ACTIONS = {
  new: { status: 'TRIAGED', label: 'Провести триаж' },
  triaged: { status: 'IN_PROGRESS', label: 'Взять в работу' },
  assigned: { status: 'IN_PROGRESS', label: 'Начать работу' },
  waiting_customer: { status: 'IN_PROGRESS', label: 'Продолжить работу' },
  waiting_internal: { status: 'IN_PROGRESS', label: 'Продолжить работу' },
};

function dateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function minutesLabel(minutes) {
  if (!Number.isFinite(minutes)) return 'SLA не задан';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} ч`;
}

function dueState(item) {
  if (!item?.dueAt || ['resolved', 'verified', 'closed'].includes(item.status)) return { label: 'Без риска', tone: 'ok' };
  const remaining = new Date(item.dueAt).getTime() - Date.now();
  if (remaining <= 0) return { label: 'SLA нарушен', tone: 'danger' };
  if (remaining <= 2 * 60 * 60 * 1000) return { label: 'SLA под риском', tone: 'warning' };
  return { label: `До ${dateTime(item.dueAt)}`, tone: 'ok' };
}

function metricNumber(outcome, key) {
  const value = outcome?.delta?.[key];
  return typeof value === 'number' ? value : null;
}

function MetricDelta({ label, value, inverse = false, suffix = '' }) {
  const improved = value === null ? null : inverse ? value < 0 : value > 0;
  const tone = improved === null ? 'neutral' : improved ? 'positive' : value === 0 ? 'neutral' : 'negative';
  return (
    <div className={`cases-outcome__metric is-${tone}`}>
      <span>{label}</span>
      <strong>{value === null ? '—' : `${value > 0 ? '+' : ''}${value}${suffix}`}</strong>
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="cases-empty">
      <span className="cases-empty__eyebrow">REPUTATION OPERATIONS</span>
      <h2>Пока нет активных кейсов</h2>
      <p>Создайте первый кейс вручную или настройте Automation Engine, чтобы повторяющийся негатив превращался в управляемый процесс.</p>
      <button type="button" onClick={onCreate}>Создать кейс</button>
    </div>
  );
}

function CreateCasePanel({ open, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('service');
  const [severity, setSeverity] = useState('MEDIUM');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setCategory('service');
    setSeverity('MEDIUM');
    setError('');
  }, [open]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await createReputationCase({
        title: title.trim() || undefined,
        category: category.trim() || 'general',
        severity,
      });
      await onCreated(result.case);
      onClose();
    } catch (nextError) {
      setError(nextError?.message || 'Не удалось создать кейс');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cases-create-layer" role="presentation">
      <button type="button" className="cases-create-layer__overlay" onClick={onClose} aria-label="Закрыть" />
      <form className="cases-create" onSubmit={submit}>
        <header>
          <div><span>NEW CASE</span><h2>Создать репутационный кейс</h2></div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <label>
          <span>Название</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, повторяющиеся жалобы на ожидание" maxLength={240} />
        </label>
        <label>
          <span>Категория</span>
          <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="service-speed" maxLength={120} required />
        </label>
        <label>
          <span>Серьёзность</span>
          <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="LOW">Низкая</option>
            <option value="MEDIUM">Средняя</option>
            <option value="HIGH">Высокая</option>
            <option value="CRITICAL">Критическая</option>
          </select>
        </label>
        {error ? <div className="cases-create__error" role="alert">{error}</div> : null}
        <footer>
          <button type="button" onClick={onClose}>Отмена</button>
          <button type="submit" className="is-primary" disabled={submitting}>{submitting ? 'Создаём…' : 'Создать кейс'}</button>
        </footer>
      </form>
    </div>
  );
}

export default function CasesWorkspace() {
  const [cases, setCases] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [resolution, setResolution] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const payload = await listReputationCases({
        limit: 100,
        ...(status ? { status: status.toUpperCase() } : {}),
        ...(severity ? { severity: severity.toUpperCase() } : {}),
        ...(overdue ? { overdue: true } : {}),
      }, { signal });
      setCases(payload.items || []);
      setSelectedId((current) => {
        if (current && payload.items.some((item) => item.id === current)) return current;
        return payload.items[0]?.id || '';
      });
    } catch (nextError) {
      if (nextError?.name !== 'AbortError') setError(nextError?.message || 'Не удалось загрузить кейсы');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [overdue, severity, status]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const visibleCases = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    if (!needle) return cases;
    return cases.filter((item) => [item.title, item.category, item.owner?.name, ...item.locations.map((location) => location.name)]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('ru-RU').includes(needle)));
  }, [cases, query]);

  const selected = cases.find((item) => item.id === selectedId) || visibleCases[0] || null;

  useEffect(() => {
    setResolution(selected?.resolution || '');
  }, [selected?.id, selected?.resolution]);

  const stats = useMemo(() => ({
    active: cases.filter((item) => !['resolved', 'verified', 'closed'].includes(item.status)).length,
    critical: cases.filter((item) => item.severity === 'critical' && !['verified', 'closed'].includes(item.status)).length,
    overdue: cases.filter((item) => dueState(item).tone === 'danger').length,
    verified: cases.filter((item) => ['verified', 'closed'].includes(item.status)).length,
  }), [cases]);

  const replaceCase = (next) => {
    setCases((current) => {
      const exists = current.some((item) => item.id === next.id);
      return exists ? current.map((item) => item.id === next.id ? next : item) : [next, ...current];
    });
    setSelectedId(next.id);
  };

  const mutate = async (operation) => {
    if (!selected || mutating) return;
    setMutating(true);
    setError('');
    try {
      const payload = await operation(selected);
      if (payload?.case) replaceCase(payload.case);
    } catch (nextError) {
      setError(nextError?.message || 'Не удалось обновить кейс');
    } finally {
      setMutating(false);
    }
  };

  const nextAction = selected ? NEXT_ACTIONS[selected.status] : null;
  const sla = selected ? dueState(selected) : null;
  const outcome = selected?.outcome || null;

  return (
    <section className="cases-workspace">
      <div className="cases-hero">
        <div>
          <span className="cases-hero__eyebrow">REPUTATION OPERATIONS</span>
          <h1>От сигнала к измеримому решению</h1>
          <p>Отзывы, AI-сигналы и автоматизации превращаются в кейсы с владельцем, SLA, задачами, причиной и проверкой результата.</p>
        </div>
        <button type="button" className="cases-hero__create" onClick={() => setCreateOpen(true)}>+ Новый кейс</button>
      </div>

      <div className="cases-stats" aria-label="Сводка кейсов">
        <div><span>Активные</span><strong>{stats.active}</strong><small>требуют действий</small></div>
        <div><span>Критические</span><strong>{stats.critical}</strong><small>в зоне риска</small></div>
        <div><span>Просрочено SLA</span><strong>{stats.overdue}</strong><small>нужна эскалация</small></div>
        <div><span>Проверено</span><strong>{stats.verified}</strong><small>результат измерен</small></div>
      </div>

      <div className="cases-toolbar">
        <label className="cases-search"><span>Поиск</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Кейс, категория, локация…" /></label>
        <label><span>Статус</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Все</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Риск</span><select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">Все</option>{Object.entries(SEVERITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="button" className={overdue ? 'is-active' : ''} onClick={() => setOverdue((value) => !value)}>Только SLA-риск</button>
      </div>

      {error ? <div className="cases-error" role="alert"><strong>Не удалось выполнить действие</strong><span>{error}</span><button type="button" onClick={() => load()}>Повторить</button></div> : null}

      {loading ? (
        <div className="cases-loading" role="status"><span /><span /><span /><p>Загружаем операционные кейсы…</p></div>
      ) : !cases.length ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="cases-grid">
          <aside className="cases-list" aria-label="Список репутационных кейсов">
            <div className="cases-list__head"><strong>{visibleCases.length} кейсов</strong><span>Приоритет по риску и SLA</span></div>
            {visibleCases.map((item) => {
              const itemSla = dueState(item);
              return (
                <button key={item.id} type="button" className={`cases-card ${selected?.id === item.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(item.id)}>
                  <div className="cases-card__meta"><span className={`severity severity--${item.severity}`}>{SEVERITY_LABELS[item.severity]}</span><span>{STATUS_LABELS[item.status]}</span></div>
                  <strong>{item.title}</strong>
                  <p>{item.category.replaceAll('-', ' ')} · {item.locations[0]?.name || 'Все локации'}</p>
                  <div className="cases-card__footer"><span className={`sla is-${itemSla.tone}`}>{itemSla.label}</span><span>{item.owner?.name || 'Без владельца'}</span></div>
                </button>
              );
            })}
          </aside>

          {selected ? (
            <article className="case-detail">
              <header className="case-detail__header">
                <div>
                  <div className="case-detail__badges"><span className={`severity severity--${selected.severity}`}>{SEVERITY_LABELS[selected.severity]}</span><span>{STATUS_LABELS[selected.status]}</span><span className={`sla is-${sla.tone}`}>{sla.label}</span></div>
                  <h2>{selected.title}</h2>
                  <p>Категория <b>{selected.category}</b> · источник {selected.origin} · создан {dateTime(selected.createdAt)}</p>
                </div>
                <div className="case-detail__owner"><span>Ответственный</span><strong>{selected.owner?.name || 'Не назначен'}</strong><small>SLA {minutesLabel(selected.slaMinutes)}</small></div>
              </header>

              <div className="case-detail__actions">
                {nextAction ? <button type="button" className="is-primary" disabled={mutating} onClick={() => mutate((item) => transitionReputationCase(item.id, nextAction.status))}>{nextAction.label}</button> : null}
                {selected.status === 'in_progress' ? <button type="button" onClick={() => mutate((item) => transitionReputationCase(item.id, 'WAITING_INTERNAL'))} disabled={mutating}>Ждём команду</button> : null}
                {selected.status === 'in_progress' ? <button type="button" onClick={() => mutate((item) => transitionReputationCase(item.id, 'WAITING_CUSTOMER'))} disabled={mutating}>Ждём клиента</button> : null}
                {selected.status === 'resolved' ? <button type="button" className="is-primary" onClick={() => mutate((item) => verifyReputationCase(item.id))} disabled={mutating}>Проверить результат</button> : null}
                {selected.status === 'verified' ? <button type="button" className="is-primary" onClick={() => mutate((item) => closeReputationCase(item.id))} disabled={mutating}>Закрыть кейс</button> : null}
                {selected.status === 'closed' ? <button type="button" onClick={() => mutate((item) => reopenReputationCase(item.id, 'Повторное открытие из рабочего пространства'))} disabled={mutating}>Открыть повторно</button> : null}
                {!['closed'].includes(selected.status) ? <button type="button" onClick={() => mutate(async (item) => { await createCaseTask(item.id, { title: `Разобрать: ${item.title}`, priority: item.severity === 'critical' ? 'critical' : 'high' }); const fresh = await listReputationCases({ limit: 100 }); return { case: fresh.items.find((candidate) => candidate.id === item.id) || item }; })} disabled={mutating}>+ Задача</button> : null}
              </div>

              <div className="case-detail__columns">
                <section className="case-panel">
                  <div className="case-panel__title"><span>01</span><div><strong>Диагностика</strong><small>Что произошло и почему</small></div></div>
                  <dl><div><dt>Root cause</dt><dd>{selected.rootCause || 'Причина ещё не зафиксирована'}</dd></div><div><dt>Локации</dt><dd>{selected.locations.map((location) => location.name).join(', ') || 'Все локации'}</dd></div><div><dt>Связанные отзывы</dt><dd>{selected.reviews.length}</dd></div></dl>
                  {selected.reviews.slice(0, 3).map((review) => <blockquote key={review.id}><b>{review.rating}★ · {review.sourceName || review.provider}</b><span>{review.text}</span></blockquote>)}
                </section>

                <section className="case-panel">
                  <div className="case-panel__title"><span>02</span><div><strong>Исполнение</strong><small>Задачи и SLA</small></div></div>
                  <div className="case-tasks">{selected.tasks.length ? selected.tasks.map((task) => <div key={task.id}><span className={`task-priority is-${task.priority}`}>{task.priority}</span><strong>{task.title}</strong><small>{task.status} · {task.deadline ? dateTime(task.deadline) : 'без срока'}</small></div>) : <p>Связанных задач пока нет.</p>}</div>
                </section>
              </div>

              {selected.status === 'in_progress' || selected.status === 'waiting_internal' || selected.status === 'waiting_customer' ? (
                <section className="case-resolution">
                  <div><span>RESOLUTION</span><h3>Зафиксируйте решение</h3><p>Решение обязательно перед переходом в «Решён». После этого Shield снимет метрики и позволит верифицировать эффект.</p></div>
                  <textarea value={resolution} onChange={(event) => setResolution(event.target.value)} rows={4} placeholder="Что изменили, кто выполнил, как проверили…" />
                  <button type="button" className="is-primary" disabled={mutating || !resolution.trim()} onClick={() => mutate((item) => transitionReputationCase(item.id, 'RESOLVED', { resolution: resolution.trim() }))}>Отметить как решённый</button>
                </section>
              ) : null}

              {outcome ? (
                <section className="cases-outcome">
                  <div className="cases-outcome__head"><div><span>VERIFIED OUTCOME</span><h3>Измеримый эффект</h3></div><strong className={outcome.resolutionSlaMet === true ? 'is-positive' : outcome.resolutionSlaMet === false ? 'is-negative' : ''}>{outcome.resolutionSlaMet === true ? 'SLA выполнен' : outcome.resolutionSlaMet === false ? 'SLA нарушен' : 'SLA без оценки'}</strong></div>
                  <div className="cases-outcome__grid"><MetricDelta label="Повторные жалобы" value={metricNumber(outcome, 'repeatedComplaints')} inverse /><MetricDelta label="Средний рейтинг" value={metricNumber(outcome, 'averageRating')} /><MetricDelta label="Topic sentiment" value={metricNumber(outcome, 'topicSentimentScore')} /><MetricDelta label="Время ответа" value={metricNumber(outcome, 'averageResponseMinutes')} inverse suffix=" мин" /></div>
                </section>
              ) : null}

              <section className="case-timeline">
                <div className="case-panel__title"><span>03</span><div><strong>История кейса</strong><small>Immutable operational trail</small></div></div>
                <div>{selected.activities.slice(0, 12).map((activity) => <div key={activity.id} className="case-timeline__item"><i /><span><strong>{activity.action.replaceAll('_', ' ')}</strong><small>{activity.fromStatus ? `${activity.fromStatus} → ${activity.toStatus}` : 'Событие кейса'} · {dateTime(activity.createdAt)}</small></span></div>)}</div>
              </section>
            </article>
          ) : null}
        </div>
      )}

      <CreateCasePanel open={createOpen} onClose={() => setCreateOpen(false)} onCreated={async (created) => { replaceCase(created); }} />
    </section>
  );
}
