import React, { memo } from 'react';
import './Badge.scss';

function Badge({ children, tone = 'neutral', className = '' }) {
  return <span className={`ui-badge ui-badge--${tone} ${className}`.trim()}>{children}</span>;
}

export default memo(Badge);
