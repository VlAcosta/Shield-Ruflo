import React from 'react';

function Svg({ children, className = '', viewBox = '0 0 24 24' }) {
  return <svg className={className} viewBox={viewBox} fill="none" aria-hidden="true">{children}</svg>;
}

export function SearchIcon(props) {
  return <Svg {...props}><circle cx="10.5" cy="10.5" r="5.7" stroke="currentColor" strokeWidth="1.8"/><path d="m15 15 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></Svg>;
}

export function FilterIcon(props) {
  return <Svg {...props}><path d="M5 7h14l-5.2 5.3v4.2l-3.6 2V12.3L5 7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></Svg>;
}

export function ReportIcon(props) {
  return <Svg {...props}><path d="M7 4.8h7l3 3v11.4H7V4.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M14 4.8v3h3M9.5 12h5M9.5 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></Svg>;
}

export function DownloadIcon(props) {
  return <Svg {...props}><path d="M12 5v9M8.8 11.1 12 14.3l3.2-3.2M6 18.5h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

export function ArrowIcon(props) {
  return <Svg {...props}><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

export function BackIcon(props) {
  return <Svg {...props}><path d="m14.5 6-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

export function CalendarIcon(props) {
  return <Svg {...props}><rect x="5" y="6.5" width="14" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="M8 4.5V8M16 4.5V8M5 10h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></Svg>;
}

export function MailIcon(props) {
  return <Svg {...props}><rect x="4.5" y="6" width="15" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="m6.5 8 5.5 4 5.5-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

export function TelegramIcon(props) {
  return <Svg {...props}><path d="M19.4 5.2 16.8 18c-.2.9-.8 1.1-1.5.7l-4-3-1.9 1.9c-.2.2-.4.4-.8.4l.3-4.1 7.5-6.8c.3-.3-.1-.5-.5-.2L6.7 12.7l-4-1.3c-.9-.3-.9-.9.2-1.3l15.6-6c.7-.3 1.4.2.9 1.1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></Svg>;
}

export function PhoneIcon(props) {
  return <Svg {...props}><rect x="7.2" y="3.8" width="9.6" height="16.4" rx="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="M10.2 17.2h3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></Svg>;
}

export function SparkIcon(props) {
  return <Svg {...props}><path d="m12 3.5 1.5 4.2 4.2 1.5-4.2 1.5-1.5 4.2-1.5-4.2-4.2-1.5 4.2-1.5L12 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="m18.2 15.4.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9Z" fill="currentColor" opacity=".75"/></Svg>;
}

export function ClockIcon(props) {
  return <Svg {...props}><circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.7"/><path d="M12 8.2V12l2.8 1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></Svg>;
}

export function CheckIcon(props) {
  return <Svg {...props}><path d="m6.8 12.1 3.1 3.2 7.3-7.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

export const CHANNEL_ICON_MAP = Object.freeze({ email: MailIcon, telegram: TelegramIcon, whatsapp: PhoneIcon });
