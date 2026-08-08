import React, { memo } from 'react';
import './EmptyState.scss';

function EmptyState({ title, text, action = null }) {
  return (
    <div className="ui-empty-state">
      <span className="ui-empty-state__mark">◇</span>
      <strong>{title}</strong>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

export default memo(EmptyState);
