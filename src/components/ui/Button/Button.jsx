import React, { memo } from 'react';
import './Button.scss';

function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export default memo(Button);
