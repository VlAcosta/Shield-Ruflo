import React from 'react';
import mark from '../../assets/brand/business-shield-mark.svg';

export default function BrandMark({ size = 40, className = '', alt = '' }) {
  return (
    <img
      className={`brand-mark ${className}`.trim()}
      src={mark}
      width={size}
      height={size}
      alt={alt}
      draggable="false"
    />
  );
}
