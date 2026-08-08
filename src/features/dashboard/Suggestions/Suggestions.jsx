import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import DashboardCard from '../../../components/ui/DashboardCard';
import Button from '../../../components/ui/Button';
import SuggestionModal from './components/SuggestionModal';
import './Suggestions.scss';

function SparkIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.5L11.25 7.1L15.5 8.5L11.25 9.9L10 14.5L8.75 9.9L4.5 8.5L8.75 7.1L10 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M15.5 13L16.1 15L18 15.6L16.1 16.2L15.5 18L14.9 16.2L13 15.6L14.9 15L15.5 13Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>;
}

function Suggestions() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  const handleSent = useCallback(() => {
    setSent(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setSent(false), 3000);
  }, []);

  return (
    <>
      <DashboardCard className={`dashboard-suggestions ${sent ? 'is-sent' : ''}`} motion="fold">
        <div className="dashboard-suggestions__badge"><SparkIcon /> Идеи продукта</div>
        <p className="dashboard-suggestions__hint">Помогите сделать кабинет удобнее</p>
        <h3>{sent ? 'Спасибо, идея передана' : 'Не хватает функции?'}</h3>
        <span className="dashboard-suggestions__fast">Форма займёт меньше минуты</span>
        <Button className="dashboard-suggestions__button" size="sm" onClick={() => setOpen(true)}>
          {sent ? 'Предложить ещё' : 'Предложить улучшение'}
        </Button>
      </DashboardCard>
      <SuggestionModal open={open} onClose={() => setOpen(false)} onSent={handleSent} />
    </>
  );
}

export default memo(Suggestions);
