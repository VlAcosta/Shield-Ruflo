import React, { memo, useEffect, useState } from 'react';
import './RouteLoader.scss';

function RouteLoader({ compact = false }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 90);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={`route-loader ${compact ? 'route-loader--compact' : ''} ${visible ? 'is-visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Загрузка"
    >
      <span className="route-loader__bar" />
      {compact ? (
        <div className="route-loader__content">
          <span className="route-loader__skeleton route-loader__skeleton--title" />
          <span className="route-loader__skeleton route-loader__skeleton--card" />
          <span className="route-loader__skeleton route-loader__skeleton--card route-loader__skeleton--short" />
        </div>
      ) : (
        <div className="route-loader__brand">
          <span className="route-loader__shield">◊</span>
          <strong>БИЗНЕС ЩИТ</strong>
        </div>
      )}
    </div>
  );
}

export default memo(RouteLoader);
