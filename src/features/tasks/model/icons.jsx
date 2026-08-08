import React from 'react';

function Icon({ children, viewBox = '0 0 24 24' }) {
  return <svg viewBox={viewBox} fill="none" aria-hidden="true">{children}</svg>;
}

export function SearchIcon() {
  return <Icon><circle cx="11" cy="11" r="6.2" stroke="currentColor" strokeWidth="1.7"/><path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></Icon>;
}

export function BoardIcon() {
  return <Icon><rect x="4.5" y="5" width="6" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/><rect x="13.5" y="5" width="6" height="8.5" rx="2" stroke="currentColor" strokeWidth="1.6"/></Icon>;
}

export function ListIcon() {
  return <Icon><path d="M8 7h11M8 12h11M8 17h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="4.8" cy="7" r="1.1" fill="currentColor"/><circle cx="4.8" cy="12" r="1.1" fill="currentColor"/><circle cx="4.8" cy="17" r="1.1" fill="currentColor"/></Icon>;
}

export function PlusIcon() {
  return <Icon><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></Icon>;
}

export function CalendarIcon() {
  return <Icon><rect x="4.5" y="6" width="15" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.6"/><path d="M8 4.5V8M16 4.5V8M4.5 10h15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></Icon>;
}

export function MessageIcon() {
  return <Icon><path d="M6.8 17H6l-2 2V8.8A2.8 2.8 0 0 1 6.8 6h10.4A2.8 2.8 0 0 1 20 8.8v5.4a2.8 2.8 0 0 1-2.8 2.8H11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></Icon>;
}

export function PaperclipIcon() {
  return <Icon><path d="m9 12.8 5.6-5.6a3 3 0 1 1 4.2 4.2l-7.4 7.4a4.4 4.4 0 0 1-6.2-6.2l6.4-6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></Icon>;
}

export function ArrowIcon() {
  return <Icon><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></Icon>;
}

export function ChevronIcon() {
  return <Icon><path d="m8 10 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></Icon>;
}

export function CloseIcon() {
  return <Icon><path d="m7.5 7.5 9 9M16.5 7.5l-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></Icon>;
}

export function CheckIcon() {
  return <Icon><path d="m6.5 12.5 3.4 3.4 7.6-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Icon>;
}

export function FileIcon() {
  return <Icon><path d="M7 3.8h6.5L18 8.3V20H7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M13.5 3.8v4.5H18" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></Icon>;
}

export function DragIcon() {
  return <Icon><circle cx="9" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="7" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="17" r="1" fill="currentColor"/><circle cx="15" cy="17" r="1" fill="currentColor"/></Icon>;
}
