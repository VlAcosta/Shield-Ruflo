import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ProfileTabs from '../ProfileTabs';
import AccountCenter from '../AccountCenter';
import CompanyProfile from '../CompanyProfile';
import SecurityProfile from '../SecurityProfile';
import AppearanceProfile from '../AppearanceProfile';
import UsersProfile from '../UsersProfile';
import InviteUserModal from '../InviteUserModal';
import useProfile from '../hooks/useProfile';
import { PROFILE_TABS } from '../model/profileData';
import useAccessControl from '../../access/hooks/useAccessControl';
import './ProfileWorkspace.scss';


export default function ProfileWorkspace() {
  const profile = useProfile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inviteOpen, setInviteOpen] = useState(false);
  const access = useAccessControl();
  const visibleTabs = useMemo(() => PROFILE_TABS.filter((tab) => {
    if (tab.id === 'company') return access.can('company.view');
    if (tab.id === 'users') return access.can('team.view');
    return true;
  }), [access]);
  const visibleTabIds = useMemo(() => new Set(visibleTabs.map((item) => item.id)), [visibleTabs]);

  const activeTab = useMemo(() => {
    const requested = searchParams.get('tab');
    return visibleTabIds.has(requested) ? requested : 'personal';
  }, [searchParams, visibleTabIds]);

  const setActiveTab = useCallback((tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'personal') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  if (profile.loading) {
    return (
      <div className="profile-skeleton" aria-label="Загрузка профиля">
        <span className="profile-skeleton__tabs" />
        <div className="profile-skeleton__body"><span /><span /></div>
      </div>
    );
  }

  if (profile.error || !profile.snapshot) {
    return (
      <section className="profile-error">
        <span className="profile-error__mark">!</span>
        <div>
          <h2>Профиль временно недоступен</h2>
          <p>{profile.error || 'Не удалось получить данные профиля.'}</p>
        </div>
        <button type="button" onClick={profile.reload}>Повторить</button>
      </section>
    );
  }

  return (
    <div className="profile-workspace">
      <ProfileTabs value={activeTab} onChange={setActiveTab} tabs={visibleTabs} />

      <div className="profile-workspace__content" key={activeTab}>
        {activeTab === 'personal' ? (
          <AccountCenter
            value={profile.snapshot.personal}
            company={profile.snapshot.company}
            sessions={profile.snapshot.sessions}
            busy={profile.busy.personal}
            onSave={profile.savePersonal}
            onOpenSecurity={() => setActiveTab('security')}
            onOpenNotifications={() => navigate('/notifications')}
          />
        ) : null}

        {activeTab === 'company' ? (
          <CompanyProfile value={profile.snapshot.company} busy={profile.busy.company} onSave={access.can('company.edit') ? profile.saveCompany : undefined} readOnly={!access.can('company.edit')} />
        ) : null}

        {activeTab === 'security' ? (
          <SecurityProfile
            sessions={profile.snapshot.sessions}
            preferences={profile.securityPreferences}
            busy={profile.busy}
            onChangePin={profile.updatePin}
            onSavePreferences={profile.saveSecurity}
            onRevokeSession={profile.revokeSession}
            onRevokeOthers={profile.revokeOthers}
          />
        ) : null}

        {activeTab === 'appearance' ? <AppearanceProfile /> : null}

        {activeTab === 'users' ? (
          <UsersProfile
            users={profile.snapshot.users}
            owner={profile.snapshot.personal}
            busy={profile.busy}
            onInvite={() => setInviteOpen(true)}
            onUpdateUser={profile.updateUser}
            onUpdateUserSecurity={profile.updateUserSecurity}
            onForceLogoutUser={profile.forceLogoutUser}
            onRevokeUserSession={profile.revokeUserSession}
            onRemoveUser={profile.removeUser}
          />
        ) : null}
      </div>

      <InviteUserModal
        open={inviteOpen}
        busy={profile.busy.invite}
        onClose={() => setInviteOpen(false)}
        onInvite={profile.inviteUser}
      />

      {profile.notice ? (
        <div className={`profile-toast profile-toast--${profile.notice.tone}`} key={profile.notice.id}>
          <span />
          {profile.notice.message}
        </div>
      ) : null}
    </div>
  );
}
