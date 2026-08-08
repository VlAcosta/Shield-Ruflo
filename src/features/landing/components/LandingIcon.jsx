import React from 'react';

const ICONS = {
  shield: <path d="M12 3.5 18.4 6v5.2c0 4.2-2.5 7.6-6.4 9.3-3.9-1.7-6.4-5.1-6.4-9.3V6L12 3.5Z" />,
  sparkles: <><path d="m12 3 1.1 3.1L16 7.2l-2.9 1.1L12 11.5l-1.1-3.2L8 7.2l2.9-1.1L12 3Z"/><path d="m18.2 12.7.7 2 2 .7-2 .8-.7 2-.7-2-2-.8 2-.7.7-2Z"/><path d="m5.7 13 .9 2.5 2.4.9-2.4.9-.9 2.5-.9-2.5-2.4-.9 2.4-.9.9-2.5Z"/></>,
  chart: <><path d="M5 19V10"/><path d="M10 19V5"/><path d="M15 19v-7"/><path d="M20 19V8"/></>,
  book: <><path d="M4.5 5.5h6.2c1 0 1.8.8 1.8 1.8V20c0-1.3-1-2.3-2.3-2.3H4.5V5.5Z"/><path d="M19.5 5.5h-6.2c-1 0-1.8.8-1.8 1.8V20c0-1.3 1-2.3 2.3-2.3h5.7V5.5Z"/></>,
  bolt: <path d="m13.2 2.8-7 10h5.2l-.6 8.4 7-10h-5.2l.6-8.4Z" />,
  blocks: <><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></>,
  check: <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.6 2.6L16.5 9"/></>,
  message: <path d="M5 5.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7l-4.8 3.2.9-3.2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />,
  rocket: <><path d="M13.5 4.4c2.3-1.3 4.9-1.4 6.1-1.1.3 1.2.2 3.8-1.1 6.1l-4.9 7.1-5.3-5.3 5.2-6.8Z"/><path d="m8.3 11.2-3.2.6-2.2 2.2 5 .8"/><path d="m13.6 16.5.6 4 2.2-2.2.7-3.2"/><circle cx="16" cy="7" r="1.5"/></>,
  pen: <><path d="m4.5 19.5 4.2-1 9.8-9.8-3.2-3.2-9.8 9.8-1 4.2Z"/><path d="m13.8 7 3.2 3.2"/></>,
  library: <><path d="M5 4h3v16H5z"/><path d="M10.5 4h3v16h-3z"/><path d="m16 5 3-.8 3.8 14.4-3 .8L16 5Z"/></>,
  report: <><path d="M6 3.5h9l3 3V20H6V3.5Z"/><path d="M15 3.5v4h4"/><path d="M9 15v-3"/><path d="M12 15V9"/><path d="M15 15v-2"/></>,
  headset: <><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><path d="M5 12h2.5v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z"/><path d="M19 12h-2.5v6H19a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2Z"/><path d="M16.5 18c-.6 1.2-1.8 2-3.3 2H12"/></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></>,
  phone: <><rect x="7.5" y="2.5" width="9" height="19" rx="2.2"/><path d="M10.5 5h3"/><path d="M11.2 18.5h1.6"/></>,
  users: <><circle cx="9" cy="9" r="3"/><path d="M3.8 19c.9-3 2.7-4.5 5.2-4.5s4.3 1.5 5.2 4.5"/><circle cx="17" cy="8" r="2.3"/><path d="M15.1 13.7c2.8-.5 4.8.8 5.7 3.8"/></>,
  wallet: <><path d="M4 6.5h14a2 2 0 0 1 2 2V18H4a2 2 0 0 1-2-2V6.5h2Z"/><path d="M4 6.5 15 3v3.5"/><path d="M15 11.5h5"/></>,
  palette: <><path d="M12 3.5a8.5 8.5 0 1 0 0 17h1.5a2 2 0 0 0 0-4H12a1.7 1.7 0 0 1 0-3.4h2.8A5.2 5.2 0 0 0 20 8c0-2.5-3.4-4.5-8-4.5Z"/><circle cx="7.3" cy="9" r=".7"/><circle cx="9" cy="6.5" r=".7"/><circle cx="12" cy="5.8" r=".7"/></>,
  diamond: <path d="m12 3 7 6-7 12L5 9l7-6Z" />,
  arrow: <><path d="M5 12h13"/><path d="m14 7 5 5-5 5"/></>,
  menu: <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
  close: <><path d="m6 6 12 12"/><path d="m18 6-12 12"/></>,
  play: <path d="M9 7.5v9l7-4.5-7-4.5Z" />,
  star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  checkCircle: <><circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.6 2.6 5.5-5.7"/></>,
};

export default function LandingIcon({ name, size = 22, className = '' }) {
  return (
    <svg
      className={`landing-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name] || ICONS.shield}
    </svg>
  );
}
