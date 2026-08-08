import React, { memo } from 'react';
import './Progress.scss';

function Progress({ value = 0, tone = 'violet', className = '' }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <span className={`ui-progress ui-progress--${tone} ${className}`.trim()}>
      <span className="ui-progress__bar" style={{ width: `${safeValue}%` }} />
    </span>
  );
}

export default memo(Progress);
