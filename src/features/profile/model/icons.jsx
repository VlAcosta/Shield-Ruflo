import React from 'react';

function IconBase({ children, className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

export function UserIcon(props) {
  return <IconBase {...props}><circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7"/><path d="M6.8 18c1.2-2.3 3-3.5 5.2-3.5s4 1.2 5.2 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></IconBase>;
}

export function BuildingIcon(props) {
  return <IconBase {...props}><rect x="5.5" y="4.5" width="13" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="M9 8.5h1M14 8.5h1M9 12.5h1M14 12.5h1M10 19.5v-3h4v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></IconBase>;
}

export function ShieldIcon(props) {
  return <IconBase {...props}><path d="M12 3.8 18 6v5.2c0 4-2.1 7-6 8.9-3.9-1.9-6-4.9-6-8.9V6l6-2.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m9.6 12 1.6 1.6 3.4-3.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></IconBase>;
}

export function UsersIcon(props) {
  return <IconBase {...props}><circle cx="9" cy="9" r="2.6" stroke="currentColor" strokeWidth="1.7"/><path d="M4.7 17c1-1.9 2.4-2.9 4.3-2.9 1.9 0 3.3 1 4.3 2.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="16.4" cy="9.6" r="2" stroke="currentColor" strokeWidth="1.7"/><path d="M14.8 16.5c.7-1.1 1.6-1.8 2.9-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></IconBase>;
}

export function CameraIcon(props) {
  return <IconBase {...props}><rect x="4.8" y="7.6" width="14.4" height="10.6" rx="2.6" stroke="currentColor" strokeWidth="1.7"/><path d="m8.8 7.6 1.4-2h3.6l1.4 2" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><circle cx="12" cy="12.8" r="2.6" stroke="currentColor" strokeWidth="1.7"/></IconBase>;
}

export function EyeIcon(props) {
  return <IconBase {...props}><path d="M4.5 12C6 8.8 8.6 7 12 7s6 1.8 7.5 5c-1.5 3.2-4.1 5-7.5 5s-6-1.8-7.5-5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><circle cx="12" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.7"/></IconBase>;
}

export function DesktopIcon(props) {
  return <IconBase {...props}><rect x="4.2" y="5.5" width="15.6" height="10.5" rx="2.3" stroke="currentColor" strokeWidth="1.7"/><path d="M9 19h6M12 16v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></IconBase>;
}

export function MobileIcon(props) {
  return <IconBase {...props}><rect x="8" y="3.8" width="8" height="16.4" rx="2.2" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="17" r=".8" fill="currentColor"/></IconBase>;
}

export function ExitIcon(props) {
  return <IconBase {...props}><path d="M10 8V6.8C10 5.8 10.8 5 11.8 5h5.4c1 0 1.8.8 1.8 1.8v10.4c0 1-.8 1.8-1.8 1.8h-5.4c-1 0-1.8-.8-1.8-1.8V16M5 12h9m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></IconBase>;
}

export function PlusIcon(props) {
  return <IconBase {...props}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></IconBase>;
}

export function MoreIcon(props) {
  return <IconBase {...props}><circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/></IconBase>;
}

export function LockIcon(props) {
  return <IconBase {...props}><rect x="5.5" y="10" width="13" height="9" rx="2.2" stroke="currentColor" strokeWidth="1.7"/><path d="M8.5 10V7.7a3.5 3.5 0 0 1 7 0V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></IconBase>;
}

export function PaletteIcon(props) {
  return <IconBase {...props}><path d="M12 4.2a7.8 7.8 0 1 0 0 15.6h1.1c1.2 0 2-1.2 1.5-2.3-.5-1.1.3-2.3 1.5-2.3h1.1A2.8 2.8 0 0 0 20 12.4 8.2 8.2 0 0 0 12 4.2Z" stroke="currentColor" strokeWidth="1.7"/><circle cx="8.2" cy="10" r="1" fill="currentColor"/><circle cx="11.2" cy="7.8" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/></IconBase>;
}

export function IntegrationIcon(props) {
  return <IconBase {...props}><path d="M8.2 7.4h-1A3.2 3.2 0 0 0 4 10.6v2.8a3.2 3.2 0 0 0 3.2 3.2h2.2M15.8 7.4h1a3.2 3.2 0 0 1 3.2 3.2v2.8a3.2 3.2 0 0 1-3.2 3.2h-2.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M9.2 12h5.6M12 9.2v5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></IconBase>;
}

export function AutomationIcon(props) {
  return <IconBase {...props}><path d="M12 4.2v3.1M12 16.7v3.1M4.2 12h3.1M16.7 12h3.1M6.5 6.5l2.2 2.2M15.3 15.3l2.2 2.2M17.5 6.5l-2.2 2.2M8.7 15.3l-2.2 2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.7"/></IconBase>;
}
