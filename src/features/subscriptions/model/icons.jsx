import React from 'react';

function Svg({ children, className = '', viewBox = '0 0 24 24' }) {
  return (
    <svg className={className} viewBox={viewBox} fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

export function CrownIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4.5 8.5 7.8 11 12 5.8l4.2 5.2 3.3-2.5-1.2 8.1H5.7L4.5 8.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6.1 19h11.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

export function MessageIcon(props) {
  return (
    <Svg {...props}>
      <path d="M5.2 6.5h13.6v8.7H10l-4.8 3V6.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8.2 10h7.6M8.2 12.8h5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

export function ChartIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 18V11M12 18V6M18 18V9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M4.5 18.5h15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".5" />
    </Svg>
  );
}

export function CameraIcon(props) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="7" width="11.5" height="10" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="m16 10.2 3.5-2v7.6l-3.5-2" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </Svg>
  );
}

export function SearchIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="10.6" cy="10.6" r="5.7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m15 15 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function SparkIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 3.8 13.5 8l4.2 1.5-4.2 1.5-1.5 4.2-1.5-4.2-4.2-1.5L10.5 8 12 3.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m18.1 15.4.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9Z" fill="currentColor" opacity=".75" />
    </Svg>
  );
}

export function CartIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6.2 7.2h12l-1.1 7.7H8.4L6.2 7.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m6.2 7.2-.8-2H3.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="9.8" cy="18" r="1.2" fill="currentColor" />
      <circle cx="16.1" cy="18" r="1.2" fill="currentColor" />
    </Svg>
  );
}

export function TagIcon(props) {
  return (
    <Svg {...props}>
      <path d="M5.1 6.2h6.2l7.6 7.6-5.1 5.1-7.6-7.6V6.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="8.6" cy="9.7" r="1.2" fill="currentColor" />
    </Svg>
  );
}

export function DownloadIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 4.8v9.1M8.8 11l3.2 3.2 3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.7 18.4h12.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

export function ReceiptIcon(props) {
  return (
    <Svg {...props}>
      <path d="M7 4.5h10v15l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3v-13.7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.5 9h5M9.5 12h5M9.5 15h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function ArrowIcon(props) {
  return (
    <Svg {...props}>
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CheckIcon(props) {
  return (
    <Svg {...props}>
      <path d="m6.8 12.1 3.1 3.2 7.3-7.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export const PACKAGE_ICON_MAP = Object.freeze({
  message: MessageIcon,
  chart: ChartIcon,
  camera: CameraIcon,
  search: SearchIcon,
});
