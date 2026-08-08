import React from 'react';

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.8',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function ReviewIcon() {
  return <svg {...svgProps}><path d="m12 3 2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.7 5.2-.8L12 3Z" /></svg>;
}

export function TaskIcon() {
  return <svg {...svgProps}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8.5 12 2.2 2.2 4.9-5" /></svg>;
}

export function ReportIcon() {
  return <svg {...svgProps}><path d="M5 20V10" /><path d="M12 20V4" /><path d="M19 20v-7" /></svg>;
}

export function ChatIcon() {
  return <svg {...svgProps}><path d="M20 15a4 4 0 0 1-4 4H9l-5 3v-7a4 4 0 0 1-1-2.6V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v7Z" /></svg>;
}

export function SystemIcon() {
  return <svg {...svgProps}><path d="M12 3 4.8 6v5.3c0 4.5 3 8.1 7.2 9.7 4.2-1.6 7.2-5.2 7.2-9.7V6L12 3Z" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>;
}

export function SettingsIcon() {
  return <svg {...svgProps}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>;
}

export function CheckAllIcon() {
  return <svg {...svgProps}><path d="m3.5 12 4 4L13 9.8" /><path d="m10.5 12 4 4L21 8.5" /></svg>;
}

export function ClockIcon() {
  return <svg {...svgProps}><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
}

export function ChevronIcon() {
  return <svg {...svgProps}><path d="m9 6 6 6-6 6" /></svg>;
}

export function SearchIcon() {
  return <svg {...svgProps}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

export const ICON_MAP = Object.freeze({
  review: ReviewIcon,
  task: TaskIcon,
  report: ReportIcon,
  chat: ChatIcon,
  system: SystemIcon,
});
