import React from 'react';
import { BuildingIcon, PaletteIcon, ShieldIcon, UserIcon, UsersIcon } from '../model/icons';
import { PROFILE_TABS } from '../model/profileData';
import './ProfileTabs.scss';

const ICONS = {
  personal: UserIcon,
  company: BuildingIcon,
  security: ShieldIcon,
  appearance: PaletteIcon,
  users: UsersIcon,
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
