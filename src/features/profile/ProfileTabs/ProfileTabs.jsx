import React from 'react';
import { BuildingIcon, PaletteIcon, ShieldIcon, UserIcon, UsersIcon } from '../model/icons';
import { PROFILE_TABS } from '../model/profileData';
import './ProfileTabs.scss';

function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M19.1 13.4v-2.8l-2-.7a6 6 0 0 0-.7-1.6l.9-1.9-2-2-1.9.9a6 6 0 0 0-1.6-.7l-.7-2H8.9l-.7 2a6 6 0 0 0-1.6.7l-1.9-.9-2 2 .9 1.9a6 6 0 0 0-.7 1.6l-2 .7v2.8l2 .7a6 6 0 0 0 .7 1.6l-.9 1.9 2 2 1.9-.9a6 6 0 0 0 1.6.7l.7 2h2.8l.7-2a6 6 0 0 0 1.6-.7l1.9.9 2-2-.9-1.9a6 6 0 0 0 .7-1.6l2-.7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

const ICONS = {
  personal: UserIcon,
  company: BuildingIcon,
  security: ShieldIcon,
  appearance: PaletteIcon,
  users: UsersIcon,
  system: SystemIcon,
};

export default function ProfileTabs({ value, onChange, tabs = PROFILE_TABS }) {
  return (
    <nav className="profile-tabs" aria-label="Разделы профиля">
      {tabs.map((tab) => {
        const Icon = ICONS[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            className={`profile-tabs__item ${value === tab.id ? 'is-active' : ''}`}
            onClick={() => onChange(tab.id)}
            aria-current={value === tab.id ? 'page' : undefined}
          >
            <span className="profile-tabs__icon"><Icon /></span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
