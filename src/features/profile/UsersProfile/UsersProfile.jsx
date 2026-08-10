import React, { useEffect, useMemo, useState } from 'react';
import useAccessControl from '../../access/hooks/useAccessControl';
import useTeamActivity from '../../access/hooks/useTeamActivity';
import useTeamSecurity from '../../access/hooks/useTeamSecurity';
import {
  PERMISSION_GROUPS,
  PRESET_ROLES,
  buildPermissionOverride,
  getAvailableRoles,
  getRoleById,
  getRoleLabel,
  permissionStateForMember,
  permissionsForMember,
} from '../../../services/access/rbacService';
import { getSecurityStatusLabel, isAccessExpired } from '../../../services/security/teamSecurityService';
import './UsersProfile.scss';

const TABS = [
  { id: 'members', label: 'Участники' },
  { id: 'roles', label: 'Роли и права' },
  { id: 'activity', label: 'Активность' },
  { id: 'security', label: 'Безопасность' },
];

function PlusIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/></svg>; }
function ShieldIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.3c0 4.5-2.7 7.6-7 9.2-4.3-1.6-7-4.7-7-9.2V6l7-2.5Z" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="m9.2 12.1 1.8 1.8 3.9-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M12 8v4l3 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
function MoreIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>; }
function DeviceIcon({ mobile = false }) { return mobile ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M10 6h4M11 18h2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="12" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M8 20h8M12 16.5V20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
function ExitIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H6.8A1.8 1.8 0 0 0 5 6.8v10.4A1.8 1.8 0 0 0 6.8 19H10M14 8l4 4-4 4M18 12H9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function SnowIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9 5l3 2 3-2M9 19l3-2 3 2M5.4 10.5l.2 3.6-3.2 1.6M18.6 13.5l-.2-3.6 3.2-1.6" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"/></svg>; }

const initialsFromName = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'БЩ';
export const canonicalRoleId = (value) => String(value || 'MEMBER').trim().toUpperCase();

function formatRelative(value) {
  if (!value) return 'ещё не входил';
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'только что';
  if (diff < 60_000) return 'только что';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн. назад`;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(value));
}

function formatDate(value, empty = 'Без ограничения') {
  if (!value) return empty;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return empty;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function dateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function expiryFromDate(value) {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null;
}

function MemberInspector({
  user,
  roles,
  canManageRoles,
  canManageSecurity,
  canRemove,
  busy,
  onUpdateUser,
  onUpdateSecurity,
  onForceLogout,
  onRevokeSession,
  onRemoveUser,
  activity,
  securityActivity,
  security,
  sessions,
  onClose,
}) {
  const [permissionGroup, setPermissionGroup] = useState(PERMISSION_GROUPS[0].id);
  const [view, setView] = useState('access');
  const [freezeReason, setFreezeReason] = useState('');
  const [expiry, setExpiry] = useState('');

  useEffect(() => {
    setFreezeReason(security?.frozenReason || '');
    setExpiry(dateInputValue(security?.accessExpiresAt));
    setView('access');
  }, [security?.accessExpiresAt, security?.frozenReason, user?.id]);

  if (!user) return null;
  const role = getRoleById(user.accessRoleId || user.role);
  const effective = new Set(permissionsForMember(user));
  const group = PERMISSION_GROUPS.find((item) => item.id === permissionGroup) || PERMISSION_GROUPS[0];
  const memberRoleId = canonicalRoleId(user.accessRoleId || user.role);
  const owner = memberRoleId === 'OWNER' || user.syntheticOwner;
  const status = getSecurityStatusLabel(user, security);
  const liveSessions = sessions.filter((session) => !session.revokedAt);

  const cycleOverride = (permissionId) => {
    if (!canManageRoles || owner) return;
    const state = permissionStateForMember(user, permissionId);
    const nextState = state === 'inherit' ? (effective.has(permissionId) ? 'deny' : 'allow') : state === 'deny' ? 'allow' : 'inherit';
    onUpdateUser(user.id, { permissionOverrides: buildPermissionOverride(user, permissionId, nextState) });
  };

  const toggleFrozen = () => {
    if (!canManageSecurity || owner) return;
    const frozen = security?.status === 'frozen';
    onUpdateSecurity(user.id, frozen ? {
      status: 'active',
      frozenAt: null,
      frozenReason: '',
    } : {
      status: 'frozen',
      frozenAt: new Date().toISOString(),
      frozenReason: freezeReason.trim() || 'Доступ приостановлен администратором',
    });
  };

  const saveExpiry = () => {
    if (!canManageSecurity || owner) return;
    onUpdateSecurity(user.id, { accessExpiresAt: expiryFromDate(expiry) });
  };

  return (
    <aside className="users-profile__inspector users-profile__inspector--secure">
      <header>
        <div className="users-profile__inspector-person">
          <span className={`users-profile__avatar is-${user.tone || role?.tone || 'violet'}`}>{user.initials || initialsFromName(user.name)}</span>
          <div><span>ACCESS PROFILE</span><h3>{user.name}</h3><small>{user.email}</small></div>
        </div>
        <button type="button" className="users-profile__inspector-close" onClick={onClose}>×</button>
      </header>

      <div className="users-profile__member-status-card users-profile__member-status-card--security">
        <div><i className={user.online ? 'is-online' : ''}/><span>{user.online ? 'Сейчас онлайн' : `Был ${formatRelative(user.lastSeenAt)}`}</span></div>
        <span className={`users-profile__security-pill is-${status.tone}`}><i/>{status.label}</span>
      </div>

      <nav className="users-profile__inspector-tabs">
        <button type="button" className={view === 'access' ? 'is-active' : ''} onClick={() => setView('access')}>Доступ</button>
        <button type="button" className={view === 'sessions' ? 'is-active' : ''} onClick={() => setView('sessions')}>Устройства <em>{liveSessions.length}</em></button>
        <button type="button" className={view === 'security' ? 'is-active' : ''} onClick={() => setView('security')}>Безопасность</button>
      </nav>

      {view === 'access' ? <>
        <section className="users-profile__inspector-role">
          <div><span>Роль</span><strong>{getRoleLabel(user.accessRoleId || user.role)}</strong></div>
          {!owner ? (
            <select aria-label="Роль участника" value={memberRoleId} onChange={(event) => onUpdateUser(user.id, { role: canonicalRoleId(event.target.value), accessRoleId: canonicalRoleId(event.target.value) })} disabled={!canManageRoles || busy.userId === user.id}>
              {roles.filter((item) => canonicalRoleId(item.id) !== 'OWNER').map((item) => <option key={item.id} value={canonicalRoleId(item.id)}>{item.label}</option>)}
            </select>
          ) : <span className="users-profile__owner-chip"><ShieldIcon/> Владелец</span>}
        </section>

        <section className="users-profile__permission-editor">
          <header><div><span>Индивидуальные права</span><strong>{effective.size} разрешений</strong></div><small>Переопределения действуют только для этого пользователя.</small></header>
          <nav>{PERMISSION_GROUPS.map((item) => <button type="button" key={item.id} className={permissionGroup === item.id ? 'is-active' : ''} onClick={() => setPermissionGroup(item.id)}>{item.label}</button>)}</nav>
          <div className="users-profile__permission-list">
            {group.permissions.map((permission) => {
              const state = permissionStateForMember(user, permission.id);
              const allowed = effective.has(permission.id);
              return (
                <button type="button" key={permission.id} className={`${allowed ? 'is-allowed' : 'is-denied'} is-${state}`} onClick={() => cycleOverride(permission.id)} disabled={!canManageRoles || owner}>
                  <span className="users-profile__permission-state">{allowed ? '✓' : '×'}</span>
                  <span><strong>{permission.label}</strong><small>{state === 'inherit' ? `По роли · ${role?.label || ''}` : state === 'allow' ? 'Разрешено персонально' : 'Запрещено персонально'}</small></span>
                  <em>{state === 'inherit' ? 'Наследуется' : 'Персонально'}</em>
                </button>
              );
            })}
          </div>
        </section>
      </> : null}

      {view === 'sessions' ? <section className="users-profile__device-center">
        <header><div><span>DEVICE CONTROL</span><h4>Активные устройства</h4></div>{!owner && canManageSecurity && liveSessions.length ? <button type="button" className="users-profile__logout-all" disabled={busy.securityUserId === user.id} onClick={() => onForceLogout(user.id)}><ExitIcon/> Завершить все</button> : null}</header>
        <p>Здесь отображаются устройства, которые использовали доступ к компании. IP и геолокацию должен возвращать сервер авторизации.</p>
        <div className="users-profile__device-list">
          {sessions.length ? sessions.map((session, index) => <article key={session.id} className={`${session.revokedAt ? 'is-revoked' : ''} ${session.current ? 'is-current' : ''}`} style={{ '--device-index': index }}>
            <span className="users-profile__device-icon"><DeviceIcon mobile={session.deviceType === 'mobile'}/></span>
            <div><div><strong>{session.label || 'Браузер'}</strong>{session.current ? <em>Это устройство</em> : session.online ? <em className="is-online">Онлайн</em> : null}</div><span>{session.location || 'Геопозиция определяется сервером'}{session.ip ? ` · ${session.ip}` : ''}</span><small>{session.revokedAt ? `Завершена ${formatRelative(session.revokedAt)}` : `Активность ${formatRelative(session.lastSeenAt)}`}</small></div>
            {!owner && canManageSecurity && !session.revokedAt ? <button type="button" onClick={() => onRevokeSession(user.id, session.id)} disabled={busy.securitySessionId === session.id} aria-label="Завершить сессию"><ExitIcon/></button> : null}
          </article>) : <div className="users-profile__device-empty"><DeviceIcon/><strong>Устройств пока нет</strong><p>Они появятся после первого входа пользователя в кабинет.</p></div>}
        </div>
      </section> : null}

      {view === 'security' ? <section className="users-profile__security-editor">
        <div className={`users-profile__freeze-card is-${status.id}`}>
          <span className="users-profile__freeze-icon"><SnowIcon/></span>
          <div><span>Состояние доступа</span><strong>{status.label}</strong><small>{owner ? 'Доступ владельца нельзя заморозить из Team Center.' : security?.status === 'frozen' ? `Приостановлен ${formatRelative(security.frozenAt)}` : 'Пользователь может входить в кабинет.'}</small></div>
        </div>

        {!owner ? <div className="users-profile__security-control">
          <div><span>Быстрая заморозка</span><strong>{security?.status === 'frozen' ? 'Восстановить доступ' : 'Приостановить без удаления'}</strong><small>Профиль, история и роль сохраняются.</small></div>
          {security?.status !== 'frozen' ? <input value={freezeReason} onChange={(event) => setFreezeReason(event.target.value)} placeholder="Причина, необязательно" disabled={!canManageSecurity}/>: null}
          <button type="button" className={security?.status === 'frozen' ? 'is-restore' : 'is-freeze'} onClick={toggleFrozen} disabled={!canManageSecurity || busy.securityUserId === user.id}>{security?.status === 'frozen' ? 'Восстановить доступ' : 'Заморозить доступ'}</button>
        </div> : null}

        {!owner ? <div className="users-profile__temporary-control">
          <header><div><span>Временный доступ</span><strong>{security?.accessExpiresAt ? `До ${formatDate(security.accessExpiresAt)}` : 'Без ограничения срока'}</strong></div><i className={security?.accessExpiresAt ? 'is-active' : ''}/></header>
          <label><span>Доступ до</span><input type="date" min={new Date().toISOString().slice(0, 10)} value={expiry} onChange={(event) => setExpiry(event.target.value)} disabled={!canManageSecurity}/></label>
          <div><button type="button" onClick={() => { const date = new Date(); date.setDate(date.getDate() + 7); setExpiry(date.toISOString().slice(0,10)); }} disabled={!canManageSecurity}>+7 дней</button><button type="button" onClick={() => { const date = new Date(); date.setDate(date.getDate() + 30); setExpiry(date.toISOString().slice(0,10)); }} disabled={!canManageSecurity}>+30 дней</button><button type="button" onClick={() => setExpiry('')} disabled={!canManageSecurity}>Постоянный</button><button type="button" className="is-save" onClick={saveExpiry} disabled={!canManageSecurity || busy.securityUserId === user.id}>Сохранить</button></div>
        </div> : null}

        {!owner ? <button type="button" className="users-profile__force-logout" onClick={() => onForceLogout(user.id)} disabled={!canManageSecurity || busy.securityUserId === user.id}><ExitIcon/><span><strong>Завершить все сессии</strong><small>Потребуется новый вход на каждом устройстве</small></span></button> : null}

        <div className="users-profile__security-mini-log">
          <header><span>Журнал безопасности</span><strong>{securityActivity.length}</strong></header>
          {securityActivity.slice(0, 6).map((item) => <article key={item.id}><i className={`is-${item.tone || 'neutral'}`}/><div><strong>{item.title}</strong><small>{item.detail || formatRelative(item.createdAt)}</small></div><time>{formatRelative(item.createdAt)}</time></article>)}
          {!securityActivity.length ? <p>Изменения доступа, ролей и сессий появятся здесь.</p> : null}
        </div>
      </section> : null}

      {view === 'access' ? <section className="users-profile__activity-mini">
        <header><span>Последние действия</span><strong>{activity.length}</strong></header>
        {activity.slice(0, 4).map((item) => <div key={item.id}><i className={`is-${item.tone || 'neutral'}`}/><span><strong>{item.title}</strong><small>{formatRelative(item.createdAt)}</small></span></div>)}
        {!activity.length ? <p>История появится после первого входа пользователя.</p> : null}
      </section> : null}

      {!owner && canRemove ? <button type="button" className="users-profile__danger" onClick={() => onRemoveUser(user.id)} disabled={busy.userId === user.id}>Удалить пользователя из компании</button> : null}
    </aside>
  );
}

function SecurityCenter({ members, securityApi, canManageSecurity, onSelect }) {
  const rows = useMemo(() => members.map((user) => {
    const security = securityApi.getSecurity(user);
    const status = getSecurityStatusLabel(user, security);
    const sessions = securityApi.getSessions(user).filter((session) => !session.revokedAt);
    return { user, security, status, sessions };
  }), [members, securityApi]);
  const frozen = rows.filter((row) => row.status.id === 'frozen').length;
  const expired = rows.filter((row) => row.status.id === 'expired').length;
  const temporary = rows.filter((row) => row.status.id === 'temporary').length;
  const activeSessions = rows.reduce((sum, row) => sum + row.sessions.length, 0);

  return <div className="users-profile__security-view">
    <section className="users-profile__security-hero">
      <div><span>SECURITY OPERATIONS</span><h3>Контроль доступа команды</h3><p>Сессии, временный доступ и мгновенная заморозка без удаления аккаунта.</p></div>
      <div className="users-profile__security-orbit"><i/><i/><span><ShieldIcon/><b>{frozen + expired}</b><small>рисков</small></span></div>
      <footer><div><strong>{activeSessions}</strong><span>активных сессий</span></div><div><strong>{temporary}</strong><span>временных доступов</span></div><div><strong>{frozen}</strong><span>заморожено</span></div><div><strong>{expired}</strong><span>истёк срок</span></div></footer>
    </section>

    <div className="users-profile__security-grid">
      <section className="users-profile__access-policies">
        <header><div><span>ACCESS POLICIES</span><h3>Участники</h3></div><small>{canManageSecurity ? 'Нажмите на пользователя для управления' : 'Режим просмотра'}</small></header>
        <div>{rows.map((row, index) => <button type="button" key={row.user.id} onClick={() => onSelect(row.user.id)} style={{ '--policy-index': index }}><span className={`users-profile__avatar is-${row.user.tone || 'violet'}`}>{row.user.initials || initialsFromName(row.user.name)}</span><span><strong>{row.user.name}</strong><small>{row.user.email || 'Владелец компании'}</small></span><em className={`is-${row.status.tone}`}><i/>{row.status.label}</em><span className="users-profile__policy-session"><strong>{row.sessions.length}</strong><small>сессий</small></span><span className="users-profile__policy-expiry">{row.security.accessExpiresAt ? formatDate(row.security.accessExpiresAt) : 'Постоянный'}</span></button>)}</div>
      </section>

      <section className="users-profile__security-log">
        <header><div><span>SECURITY LOG</span><h3>Критичные события</h3></div><strong><i/> live</strong></header>
        <div>{securityApi.securityEvents.length ? securityApi.securityEvents.slice(0, 16).map((item, index) => <article key={item.id} style={{ '--security-index': index }}><span className={`is-${item.tone || 'neutral'}`}/><div><strong>{item.title}</strong><p>{item.detail || item.actor?.name || 'Системное событие'}</p></div><time>{formatRelative(item.createdAt)}</time></article>) : <div className="users-profile__security-empty"><ShieldIcon/><strong>Рисковых событий нет</strong><p>Смена PIN, заморозка, роли и отключение устройств будут фиксироваться здесь.</p></div>}</div>
      </section>
    </div>
  </div>;
}

export default function UsersProfile({
  users,
  owner,
  busy,
  onInvite,
  onUpdateUser,
  onUpdateUserSecurity,
  onForceLogoutUser,
  onRevokeUserSession,
  onRemoveUser,
}) {
  const access = useAccessControl();
  const [tab, setTab] = useState('members');
  const roles = useMemo(() => getAvailableRoles().filter((role) => role.system), []);
  const [selectedId, setSelectedId] = useState(null);
  const [menuId, setMenuId] = useState(null);

  const ownerMember = useMemo(() => owner ? {
    id: 'current-owner',
    syntheticOwner: true,
    initials: initialsFromName(`${owner.firstName || ''} ${owner.lastName || ''}`),
    name: `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || 'Владелец компании',
    email: owner.email || '',
    role: 'OWNER',
    accessRoleId: 'OWNER',
    active: true,
    tone: 'violet',
  } : null, [owner]);

  const baseUsers = useMemo(() => [ownerMember, ...users].filter(Boolean), [ownerMember, users]);
  const team = useTeamActivity(baseUsers);
  const members = team.users;
  const securityApi = useTeamSecurity(members);
  const selectedUser = members.find((user) => user.id === selectedId) || null;
  const selectedActivity = selectedUser ? team.getActivity(selectedUser) : [];
  const selectedSecurityActivity = selectedUser ? securityApi.getSecurityActivity(selectedUser) : [];
  const selectedSecurity = selectedUser ? securityApi.getSecurity(selectedUser) : null;
  const selectedSessions = selectedUser ? securityApi.getSessions(selectedUser) : [];
  const onlineCount = members.filter((user) => user.online).length;
  const pendingCount = members.filter((user) => user.invitationStatus === 'pending').length;
  const securityRiskCount = members.filter((user) => {
    const security = securityApi.getSecurity(user);
    return security.status === 'frozen' || isAccessExpired(security.accessExpiresAt);
  }).length;
  const canInvite = access.can('team.invite');
  const canManageRoles = access.can('team.manage_roles');
  const canManageSecurity = access.can('team.manage_security');
  const canRemove = access.can('team.remove');

  return (
    <section className="users-profile">
      <header className="users-profile__hero">
        <div>
          <span>TEAM ACCESS CENTER</span>
          <h2>Команда, роли и безопасность</h2>
          <p>Управляйте полномочиями, устройствами и сроком доступа без удаления рабочих профилей.</p>
        </div>
        <div className="users-profile__hero-actions">
          {canManageRoles ? <button type="button" className="users-profile__role-create" disabled title="Пользовательские роли станут доступны после подключения серверного управления ролями"><ShieldIcon/> Свои роли недоступны</button> : null}
          {canInvite ? <button type="button" className="users-profile__invite" onClick={onInvite}><PlusIcon/> Пригласить</button> : null}
        </div>
      </header>

      <div className="users-profile__metrics users-profile__metrics--five">
        <div><span>Участники</span><strong>{members.length}</strong><small>в компании</small></div>
        <div className="is-live"><span>Онлайн</span><strong>{onlineCount}</strong><small>активны сейчас</small></div>
        <div><span>Ожидают</span><strong>{pendingCount}</strong><small>приглашений</small></div>
        <div className={securityRiskCount ? 'is-risk' : ''}><span>Контроль</span><strong>{securityRiskCount}</strong><small>{securityRiskCount ? 'требует внимания' : 'рисков нет'}</small></div>
        <div><span>Свои роли</span><strong>—</strong><small>нужен серверный API</small></div>
      </div>

      <nav className="users-profile__tabs">{TABS.map((item) => <button type="button" key={item.id} className={tab === item.id ? 'is-active' : ''} onClick={() => { setTab(item.id); setSelectedId(null); }}>{item.label}{item.id === 'activity' && team.activity.length ? <em>{Math.min(team.activity.length, 99)}</em> : item.id === 'security' && securityRiskCount ? <em className="is-risk">{securityRiskCount}</em> : null}</button>)}</nav>

      {tab === 'members' ? (
        <div className={`users-profile__members-layout ${selectedUser ? 'has-inspector' : ''}`}>
          <div className="users-profile__member-list">
            <div className="users-profile__member-head"><span>Пользователь</span><span>Роль</span><span>Статус</span><span>Последний вход</span><span/></div>
            {members.map((user, index) => {
              const role = getRoleById(user.accessRoleId || user.role);
              const isPending = user.invitationStatus === 'pending';
              const security = securityApi.getSecurity(user);
              const securityStatus = getSecurityStatusLabel(user, security);
              const presenceLabel = securityStatus.id === 'active'
                ? (isPending ? 'Приглашён' : user.online ? 'Онлайн' : formatRelative(user.lastSeenAt))
                : securityStatus.label;
              return (
                <button type="button" className={`users-profile__member-row ${selectedId === user.id ? 'is-selected' : ''} is-security-${securityStatus.id}`} key={user.id} onClick={() => setSelectedId(user.id)} style={{ '--member-index': index }}>
                  <span className="users-profile__member-person"><span className={`users-profile__avatar is-${user.tone || role?.tone || 'violet'}`}>{user.initials || initialsFromName(user.name)}</span><span><strong>{user.name}</strong><small>{user.email || 'Личный профиль'}</small></span></span>
                  <span className={`users-profile__role-badge is-${role?.tone || 'violet'}`}>{role?.label || getRoleLabel(user.role)}</span>
                  <span className={`users-profile__presence ${user.online && securityStatus.id === 'active' ? 'is-online' : ''} is-${securityStatus.tone}`}><i/>{presenceLabel}</span>
                  <span className="users-profile__last-login">{isPending ? '—' : formatRelative(user.lastLoginAt)}</span>
                  <span className="users-profile__member-more" onClick={(event) => { event.stopPropagation(); setMenuId((current) => current === user.id ? null : user.id); }}><MoreIcon/>{menuId === user.id ? <i className="users-profile__member-menu"><b>{permissionsForMember(user).length} разрешений</b><small>{securityStatus.id !== 'active' ? securityStatus.label : isPending ? 'Ожидает принятия приглашения' : user.online ? 'Активен в кабинете' : 'Сейчас не в сети'}</small></i> : null}</span>
                </button>
              );
            })}
          </div>
          {selectedUser ? <MemberInspector user={selectedUser} roles={roles} canManageRoles={canManageRoles} canManageSecurity={canManageSecurity} canRemove={canRemove} busy={busy} onUpdateUser={onUpdateUser} onUpdateSecurity={onUpdateUserSecurity} onForceLogout={onForceLogoutUser} onRevokeSession={onRevokeUserSession} activity={selectedActivity} securityActivity={selectedSecurityActivity} security={selectedSecurity} sessions={selectedSessions} onRemoveUser={onRemoveUser} onClose={() => setSelectedId(null)} /> : null}
        </div>
      ) : null}

      {tab === 'roles' ? (
        <div className="users-profile__roles-view">
          <p>Пользовательские роли пока недоступны: для безопасного создания и изменения требуется серверное хранение и проверка разрешений.</p>
          <div className="users-profile__role-grid">
            {roles.map((role, index) => <article className={`users-profile__role-card is-${role.tone || 'violet'}`} key={role.id} style={{ '--role-index': index }}><header><span className="users-profile__role-symbol"><ShieldIcon/></span><div><span>Системная роль</span><h3>{role.label}</h3></div></header><p>{role.description}</p><div className="users-profile__role-stats"><span><strong>{role.permissions.length}</strong> разрешений</span><span><strong>{members.filter((member) => canonicalRoleId(member.accessRoleId || member.role) === canonicalRoleId(role.id)).length}</strong> участников</span></div><footer><span>{canonicalRoleId(role.id) === 'OWNER' ? 'Полный контроль' : 'Предустановленная политика'}</span></footer></article>)}
          </div>

          <section className="users-profile__matrix">
            <header><div><span>PERMISSION MATRIX</span><h3>Матрица системных ролей</h3></div><p>Быстро сравнивайте, какие действия доступны каждой базовой роли.</p></header>
            <div className="users-profile__matrix-scroll"><div className="users-profile__matrix-grid"><div className="users-profile__matrix-head"><span>Разрешение</span>{PRESET_ROLES.map((role) => <strong key={role.id}>{role.label}</strong>)}</div>{PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission, index) => <div className="users-profile__matrix-row" key={permission.id}><span><small>{index === 0 ? group.label : ''}</small><strong>{permission.label}</strong></span>{PRESET_ROLES.map((role) => <i key={role.id} className={role.permissions.includes(permission.id) ? 'is-on' : 'is-off'}>{role.permissions.includes(permission.id) ? '✓' : '—'}</i>)}</div>))}</div></div>
          </section>
        </div>
      ) : null}

      {tab === 'activity' ? (
        <div className="users-profile__activity-view">
          <header><div><span>LIVE AUDIT</span><h3>Что происходило в компании</h3></div><strong><i/> обновляется автоматически</strong></header>
          <div className="users-profile__activity-feed">{team.activity.length ? team.activity.map((item, index) => <article key={item.id} style={{ '--activity-index': index }}><span className={`users-profile__activity-dot is-${item.tone || 'neutral'}`}/><div><span>{item.actor?.name || item.actor?.email || 'Пользователь'}</span><strong>{item.title}</strong>{item.detail ? <p>{item.detail}</p> : null}</div><time>{formatRelative(item.createdAt)}</time></article>) : <div className="users-profile__activity-empty"><ClockIcon/><strong>История пока пустая</strong><p>Здесь появятся входы, изменения ролей и важные действия команды.</p></div>}</div>
        </div>
      ) : null}

      {tab === 'security' ? <SecurityCenter members={members} securityApi={securityApi} canManageSecurity={canManageSecurity} onSelect={(id) => { setSelectedId(id); setTab('members'); }} /> : null}

    </section>
  );
}
