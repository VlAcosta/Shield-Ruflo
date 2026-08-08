import React, { memo, useEffect, useRef, useState } from 'react';

function easeOutCubic(value) { return 1 - Math.pow(1 - value, 3); }

function AnimatedValue({ value, formatter = (next) => String(next), duration = 420, className = '', fallback = '—' }) {
  const numeric = Number(value);
  const valid = value !== null && value !== undefined && value !== '' && Number.isFinite(numeric);
  const previousRef = useRef(valid ? numeric : 0);
  const [displayed, setDisplayed] = useState(valid ? numeric : null);

  useEffect(() => {
    if (!valid) { setDisplayed(null); return undefined; }
    const from = previousRef.current;
    const to = numeric;
    previousRef.current = to;
    if (from === to || typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplayed(to);
      return undefined;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      setDisplayed(from + (to - from) * easeOutCubic(progress));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, numeric, valid]);

  return <span className={className}>{displayed === null ? fallback : formatter(displayed)}</span>;
}
export default memo(AnimatedValue);
