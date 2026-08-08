import React, { memo } from 'react';
import './Avatar.scss';

function Avatar({ initials, tone = 'violet', size = 'md', className = '' }) {
  return (
    <span className={`ui-avatar ui-avatar--${tone} ui-avatar--${size} ${className}`.trim()} aria-hidden="true">
      {initials}
    </span>
  );
}

export default memo(Avatar);
