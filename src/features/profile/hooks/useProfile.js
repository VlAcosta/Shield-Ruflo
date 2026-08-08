import { useCallback, useEffect, useRef, useState } from 'react';
import {
  changeProfilePin,
  getProfileSnapshot,
  inviteProfileUser,
  removeProfileUser,
  revokeOtherProfileSessions,
  revokeProfileSession,
  saveCompanyProfile,
  savePersonalProfile,
  updateProfileUser,
} from '../../../services/profile/profileService';
import {
  readSecurityPreferences,
  saveSecurityPreferences,
} from '../../../services/security/securityPreferencesService';
import {
  forceLogoutMember,
  revokeMemberSession,
  updateMemberSecurityPolicy,
} from '../../../services/security/teamSecurityService';
import { recordCompanyActivity } from '../../../services/activity/companyActivityService';

export default function useProfile() {
  const mountedRef = useRef(true);
  const noticeTimerRef = useRef(null);

  const [snapshot, setSnapshot] = useState(null);
  const [securityPreferences, setSecurityPreferences] = useState(readSecurityPreferences);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState({
    personal: false,
    company: false,
    pin: false,
    preferences: false,
    sessions: false,
    invite: false,
    userId: null,
    securityUserId: null,
    securitySessionId: null,
  });
  const [notice, setNotice] = useState(null);

  useEffect(() => () => {
    mountedRef.current = false;
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const showNotice = useCallback((message, tone = 'success') => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setNotice({ id: Date.now(), message, tone });
    noticeTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, 3200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getProfileSnapshot();
      if (mountedRef.current) setSnapshot(data);
    } catch {
      if (mountedRef.current) setError('Не удалось загрузить профиль.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const savePersonal = useCallback(async (personal) => {
    if (!snapshot || busy.personal) return false;
    setBusy((current) => ({ ...current, personal: true }));

    try {
      const next = await savePersonalProfile(personal, snapshot);
      if (mountedRef.current) setSnapshot(next);
      showNotice('Личные данные сохранены');
      return true;
    } catch {
      showNotice('Не удалось сохранить личные данные', 'error');
      return false;
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, personal: false }));
    }
  }, [busy.personal, showNotice, snapshot]);

  const saveCompany = useCallback(async (company) => {
    if (!snapshot || busy.company) return false;
    setBusy((current) => ({ ...current, company: true }));

    try {
      const next = await saveCompanyProfile(company, snapshot);
      if (mountedRef.current) setSnapshot(next);
      showNotice('Данные компании сохранены');
      return true;
    } catch {
      showNotice('Не удалось сохранить данные компании', 'error');
      return false;
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, company: false }));
    }
  }, [busy.company, showNotice, snapshot]);

  const updatePin = useCallback(async (payload) => {
    if (busy.pin) return { success: false };
    setBusy((current) => ({ ...current, pin: true }));

    try {
      await changeProfilePin(payload);
      showNotice('PIN-код изменён');
      return { success: true };
    } catch (requestError) {
      const message = requestError?.message || 'Не удалось изменить PIN-код';
      showNotice(message, 'error');
      return { success: false, message };
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, pin: false }));
    }
  }, [busy.pin, showNotice]);

  const saveSecurity = useCallback(async (preferences) => {
    if (busy.preferences) return false;
    setBusy((current) => ({ ...current, preferences: true }));

    try {
      const next = saveSecurityPreferences(preferences);
      if (mountedRef.current) setSecurityPreferences(next);
      recordCompanyActivity({ type: 'security_autolock_changed', title: 'Изменена политика автоблокировки', detail: next.autoLock ? `${next.sessionMinutes} мин. бездействия` : 'Автоблокировка отключена', tone: 'neutral' });
      showNotice('Политика автоблокировки сохранена');
      return true;
    } catch {
      showNotice('Не удалось сохранить настройки автоблокировки', 'error');
      return false;
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, preferences: false }));
    }
  }, [busy.preferences, showNotice]);

  const revokeSession = useCallback(async (sessionId) => {
    if (!snapshot || busy.sessions) return;
    setBusy((current) => ({ ...current, sessions: true }));

    try {
      const next = await revokeProfileSession(sessionId, snapshot);
      if (mountedRef.current) setSnapshot(next);
      showNotice('Сессия завершена');
    } catch {
      showNotice('Не удалось завершить сессию', 'error');
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, sessions: false }));
    }
  }, [busy.sessions, showNotice, snapshot]);

  const revokeOthers = useCallback(async () => {
    if (!snapshot || busy.sessions) return;
    setBusy((current) => ({ ...current, sessions: true }));

    try {
      const next = await revokeOtherProfileSessions(snapshot);
      if (mountedRef.current) setSnapshot(next);
      showNotice('Другие сессии завершены');
    } catch {
      showNotice('Не удалось завершить другие сессии', 'error');
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, sessions: false }));
    }
  }, [busy.sessions, showNotice, snapshot]);

  const inviteUser = useCallback(async (payload) => {
    if (!snapshot || busy.invite) return { ok: false };
    setBusy((current) => ({ ...current, invite: true }));

    try {
      const result = await inviteProfileUser(payload, snapshot);
      const nextSnapshot = result?.snapshot || result;
      if (mountedRef.current) setSnapshot(nextSnapshot);
      showNotice(result?.invitation?.demo ? 'Ссылка приглашения создана' : 'Приглашение отправлено');
      return { ok: true, invitation: result?.invitation || null };
    } catch (requestError) {
      showNotice(requestError?.message || 'Не удалось пригласить пользователя', 'error');
      return { ok: false, message: requestError?.message };
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, invite: false }));
    }
  }, [busy.invite, showNotice, snapshot]);

  const updateUser = useCallback(async (userId, patch) => {
    if (!snapshot || busy.userId) return;
    setBusy((current) => ({ ...current, userId }));

    const previous = snapshot;
    setSnapshot({
      ...snapshot,
      users: snapshot.users.map((user) => user.id === userId ? { ...user, ...patch } : user),
    });

    try {
      const next = await updateProfileUser(userId, patch, snapshot);
      if (mountedRef.current) setSnapshot(next);
      showNotice('Пользователь обновлён');
    } catch {
      if (mountedRef.current) setSnapshot(previous);
      showNotice('Не удалось обновить пользователя', 'error');
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, userId: null }));
    }
  }, [busy.userId, showNotice, snapshot]);


  const updateUserSecurity = useCallback(async (userId, patch) => {
    if (!snapshot || busy.securityUserId) return false;
    const user = snapshot.users.find((item) => item.id === userId);
    if (!user) return false;
    setBusy((current) => ({ ...current, securityUserId: userId }));
    try {
      const security = await updateMemberSecurityPolicy(user, patch);
      const userPatch = {
        securityStatus: security.status,
        frozenAt: security.frozenAt,
        frozenReason: security.frozenReason,
        accessExpiresAt: security.accessExpiresAt,
        sessionRevision: security.sessionRevision,
        lastForcedLogoutAt: security.forcedLogoutAt,
        active: security.status !== 'frozen',
      };
      const next = await updateProfileUser(userId, userPatch, snapshot);
      if (mountedRef.current) setSnapshot(next);
      showNotice(security.status === 'frozen' ? 'Доступ пользователя заморожен' : 'Политика доступа обновлена', security.status === 'frozen' ? 'neutral' : 'success');
      return true;
    } catch (requestError) {
      showNotice(requestError?.message || 'Не удалось обновить безопасность пользователя', 'error');
      return false;
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, securityUserId: null }));
    }
  }, [busy.securityUserId, showNotice, snapshot]);

  const forceLogoutUser = useCallback(async (userId) => {
    if (!snapshot || busy.securityUserId) return false;
    const user = snapshot.users.find((item) => item.id === userId);
    if (!user) return false;
    setBusy((current) => ({ ...current, securityUserId: userId }));
    try {
      const security = await forceLogoutMember(user);
      const next = await updateProfileUser(userId, {
        lastForcedLogoutAt: security.forcedLogoutAt,
        sessionRevision: security.sessionRevision,
      }, snapshot);
      if (mountedRef.current) setSnapshot(next);
      showNotice('Все сессии пользователя завершены', 'neutral');
      return true;
    } catch (requestError) {
      showNotice(requestError?.message || 'Не удалось завершить сессии пользователя', 'error');
      return false;
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, securityUserId: null }));
    }
  }, [busy.securityUserId, showNotice, snapshot]);

  const revokeUserSession = useCallback(async (userId, sessionId) => {
    if (!snapshot || busy.securitySessionId) return false;
    const user = snapshot.users.find((item) => item.id === userId);
    if (!user) return false;
    setBusy((current) => ({ ...current, securitySessionId: sessionId }));
    try {
      await revokeMemberSession(user, sessionId);
      showNotice('Сессия устройства завершена', 'neutral');
      return true;
    } catch (requestError) {
      showNotice(requestError?.message || 'Не удалось завершить сессию', 'error');
      return false;
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, securitySessionId: null }));
    }
  }, [busy.securitySessionId, showNotice, snapshot]);

  const removeUser = useCallback(async (userId) => {
    if (!snapshot || busy.userId) return;
    setBusy((current) => ({ ...current, userId }));

    try {
      const next = await removeProfileUser(userId, snapshot);
      if (mountedRef.current) setSnapshot(next);
      showNotice('Пользователь удалён', 'neutral');
    } catch {
      showNotice('Не удалось удалить пользователя', 'error');
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, userId: null }));
    }
  }, [busy.userId, showNotice, snapshot]);

  return {
    snapshot,
    securityPreferences,
    loading,
    error,
    reload: load,
    busy,
    notice,
    savePersonal,
    saveCompany,
    updatePin,
    saveSecurity,
    revokeSession,
    revokeOthers,
    inviteUser,
    updateUser,
    updateUserSecurity,
    forceLogoutUser,
    revokeUserSession,
    removeUser,
  };
}
