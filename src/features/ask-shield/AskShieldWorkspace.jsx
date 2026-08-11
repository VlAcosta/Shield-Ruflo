import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { askShield, getAskShieldHistory, getAskShieldQuery } from '../../services/askShield/askShieldService';
import './AskShieldWorkspace.scss';

const PROMPTS = [
  'Что изменилось в репутации за последние 30 дней?',
  'Какие проблемы требуют внимания прямо сейчас?',
  'Что говорят последние негативные отзывы?',
  'Где у нас слабые места: отзывы, AI Visibility или listings?',
];

export default function AskShieldWorkspace() {
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const selected = useMemo(() => history.find((item) => item.id === selectedId) ?? history[0] ?? null, [history, selectedId]);

  const loadHistory = useCallback(async (signal) => {
    try {
      const response = await getAskShieldHistory({ signal, limit: 40 });
      setHistory(response.items ?? []);
      setSelectedId((value) => value || response.items?.[0]?.id || '');
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || 'Не удалось загрузить Ask Shield');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory]);

  useEffect(() => () => { if (pollRef.current) window.clearTimeout(pollRef.current); }, []);

  async function poll(queryId) {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    try {
      const response = await getAskShieldQuery(queryId);
      setHistory((items) => {
        const exists = items.some((item) => item.id === response.query.id);
        return exists ? items.map((item) => item.id === response.query.id ? response.query : item) : [response.query, ...items];
      });
      if (response.query.status === 'RUNNING') {
        pollRef.current = window.setTimeout(() => poll(queryId), 1200);
      } else {
        setBusy(false);
      }
    } catch (err) {
      setBusy(false);
      setError(err?.message || 'Не удалось получить ответ Ask Shield');
    }
  }

  async function submit(event) {
    event?.preventDefault?.();
    const value = question.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await askShield(value);
      setHistory((items) => [response.query, ...items.filter((item) => item.id !== response.query.id)]);
      setSelectedId(response.query.id);
      setQuestion('');
      await poll(response.query.id);
    } catch (err) {
      setBusy(false);
      setError(err?.message || 'Ask Shield недоступен');
    }
  }

  return (
    <section className="ask-shield-workspace">
      <header className="ask-shield-hero">
        <div><span>READ-ONLY BUSINESS INTELLIGENCE</span><h1>Ask Shield</h1><p>Задавайте вопросы по данным текущего workspace. Ответ строится только из серверного tenant-контекста и показывает evidence, на которое он опирается.</p></div>
        <div className="ask-shield-guard"><strong>Evidence first</strong><span>Без скрытых write-actions</span></div>
      </header>

      {error ? <div className="ask-shield-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>×</button></div> : null}

      <div className="ask-shield-layout">
        <aside className="ask-shield-history">
          <div className="ask-shield-history__head"><span>История</span><strong>{history.length}</strong></div>
          {loading ? <div className="ask-shield-loading">Загрузка…</div> : null}
          {!loading && history.length === 0 ? <div className="ask-shield-empty-mini">История пока пуста</div> : null}
          {history.map((item) => <button type="button" key={item.id} className={selected?.id === item.id ? 'is-selected' : ''} onClick={() => setSelectedId(item.id)}><span className={`is-${item.status.toLowerCase()}`}>{item.status}</span><strong>{item.question}</strong><small>{new Date(item.createdAt).toLocaleString('ru-RU')}</small></button>)}
        </aside>

        <main className="ask-shield-main">
          <div className="ask-shield-answer">
            {!selected ? <div className="ask-shield-empty"><span>ASK SHIELD</span><h2>Спросите о своём бизнесе</h2><p>Например: почему вырос негатив, какие кейсы требуют внимания или как меняется AI Visibility.</p></div> : <>
              <div className="ask-shield-answer__question"><span>QUESTION</span><h2>{selected.question}</h2></div>
              {selected.status === 'RUNNING' ? <div className="ask-shield-thinking"><i /><div><strong>Shield анализирует tenant data</strong><span>Ответ появится после реального provider result.</span></div></div> : null}
              {selected.status === 'FAILED' ? <div className="ask-shield-failed"><strong>{selected.errorCode || 'ASK_SHIELD_FAILED'}</strong><span>{selected.errorMessage || 'Не удалось получить ответ'}</span></div> : null}
              {selected.status === 'SUCCEEDED' ? <div className="ask-shield-answer__body"><p>{selected.answer}</p><div className="ask-shield-meta"><span>{selected.provider || 'provider'}</span><span>{selected.model || 'model'}</span><span>{selected.promptVersion || 'prompt'}</span></div></div> : null}

              {selected.status === 'SUCCEEDED' ? <section className="ask-shield-evidence"><header><div><span>01</span><strong>Evidence</strong></div><small>{selected.evidence?.length ?? 0} источников</small></header>{selected.evidence?.length ? <div>{selected.evidence.map((item, index) => item.route ? <Link key={`${item.type}-${item.id || index}`} to={item.route}><span>{item.type}</span><strong>{item.label}</strong><p>{item.summary || 'Открыть источник'}</p></Link> : <article key={`${item.type}-${item.id || index}`}><span>{item.type}</span><strong>{item.label}</strong><p>{item.summary || 'Aggregate evidence'}</p></article>)}</div> : <p className="ask-shield-muted">Ответ не сослался на конкретные evidence entries. Относитесь к нему как к low-confidence summary.</p>}</section> : null}
            </>}
          </div>

          <form className="ask-shield-composer" onSubmit={submit}>
            <div className="ask-shield-prompts">{PROMPTS.map((prompt) => <button type="button" key={prompt} disabled={busy} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div>
            <div className="ask-shield-input"><textarea rows="3" maxLength="2000" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Спросите Ask Shield о данных вашего бизнеса…" /><button type="submit" disabled={busy || question.trim().length < 3}>{busy ? 'Анализ…' : 'Спросить'}</button></div>
            <small>Ask Shield работает read-only: рекомендации не означают, что действие уже выполнено.</small>
          </form>
        </main>
      </div>
    </section>
  );
}
