import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import useNotificationBadge from '../../../hooks/useNotificationBadge';
import useReviewsBadge from '../../../hooks/useReviewsBadge';
import usePortalProfile from '../hooks/usePortalProfile';
import {
  BellIcon,
  ChevronDownIcon,
  LockIcon,
  SearchIcon,
  ReviewsIcon,
} from '../icons';
import PortalNotificationsMenu from './PortalNotificationsMenu';
import PortalProfileMenu from './PortalProfileMenu';
import PortalSearch from './PortalSearch';
import useAccessControl from '../../../features/access/hooks/useAccessControl';

function formatBadge(count) {
  if (!count) return '';
  return count > 9 ? '9+' : String(count);
}

function PortalTopbar({
  title,
  subtitle,
  onOpenReviews,
  onPreloadReviews,
  onLock,
  navigationLocked = false,
  canLock = true,
}) {
  const unreadNotifications = useNotificationBadge();
  const pendingReviews = useReviewsBadge();
  const profile = usePortalProfile();
  const access = useAccessControl();
  const canViewReviews = access.can('reviews.view');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileTriggerRef = useRef(null);

  const closeFloatingMenus = useCallback(() => {
    setNotificationsOpen(false);
    setProfileOpen(false);
  }, []);

  useEffect(() => {
    if (!navigationLocked) return;
    setSearchOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
  }, [navigationLocked]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (navigationLocked || document.body.classList.contains('portal-modal-open')) return;

      const target = event.target;
      const typing = target instanceof HTMLElement && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.isContentEditable
      );

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        closeFloatingMenus();
        setSearchOpen(true);
      }

      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        closeFloatingMenus();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [closeFloatingMenus, navigationLocked]);

  return (
    <>
      <header className="portal__topbar">
        <div className="portal__topbarTitle">
          {subtitle ? <div className="portal__subtitle">{subtitle}</div> : null}
          {title ? <h1 className="portal__title">{title}</h1> : null}
        </div>

        <div className="portal__topbarRight">
          <button
            type="button"
            className={`portal__search ${navigationLocked ? 'is-disabled' : ''}`}
            onClick={() => {
              if (navigationLocked) return;
              closeFloatingMenus();
              setSearchOpen(true);
            }}
            disabled={navigationLocked}
            aria-label={navigationLocked ? 'Поиск будет доступен после завершения настройки' : 'Открыть поиск'}
          >
            <SearchIcon />
            <span>{navigationLocked ? 'Доступ после настройки' : 'Поиск по кабинету'}</span>
            {!navigationLocked ? <kbd><b>Ctrl</b><i>K</i></kbd> : null}
          </button>

          <button
            type="button"
            className={`portal__reviewsBtn ${navigationLocked || !canViewReviews ? 'is-disabled' : ''}`}
            onMouseEnter={navigationLocked || !canViewReviews ? undefined : onPreloadReviews}
            onFocus={navigationLocked || !canViewReviews ? undefined : onPreloadReviews}
            onClick={() => {
              if (navigationLocked || !canViewReviews) return;
              closeFloatingMenus();
              onOpenReviews?.();
            }}
            disabled={navigationLocked || !canViewReviews}
            aria-label={navigationLocked ? 'Отзывы будут доступны после завершения настройки' : (!canViewReviews ? 'Роль не разрешает просмотр отзывов' : 'Новые отзывы')}
          >
            <span className="portal__reviewsBtnIcon"><ReviewsIcon /></span>
            <span className="portal__reviewsBtnCopy">
              <small>Отзывы</small>
              <strong>{navigationLocked ? 'Недоступны' : (!canViewReviews ? 'Нет доступа' : (pendingReviews ? 'Новые' : 'Нет новых'))}</strong>
            </span>
            {!navigationLocked && canViewReviews ? <span className="portal__reviewsCounter">{pendingReviews > 99 ? '99+' : pendingReviews}</span> : null}
          </button>

          <div className="portal__topbarSlot">
            <button
              type="button"
              className={`portal__iconBtn ${notificationsOpen ? 'is-active' : ''} ${navigationLocked ? 'is-disabled' : ''}`}
              aria-label={navigationLocked ? 'Уведомления будут доступны после завершения настройки' : (unreadNotifications ? `Уведомления: ${unreadNotifications} непрочитанных` : 'Уведомления')}
              aria-expanded={!navigationLocked && notificationsOpen}
              disabled={navigationLocked}
              onClick={() => {
                if (navigationLocked) return;
                setProfileOpen(false);
                setNotificationsOpen((value) => !value);
              }}
            >
              <BellIcon />
              {!navigationLocked && unreadNotifications ? <em>{formatBadge(unreadNotifications)}</em> : null}
            </button>
            {!navigationLocked ? (
              <PortalNotificationsMenu
                open={notificationsOpen}
                onClose={() => setNotificationsOpen(false)}
              />
            ) : null}
          </div>

          <button
            type="button"
            className={`portal__lockQuick ${!canLock ? 'is-disabled' : ''}`}
            onClick={() => canLock && onLock?.()}
            disabled={!canLock}
            title={canLock ? 'Заблокировать кабинет' : 'Блокировка станет доступна после настройки PIN'}
          >
            <LockIcon />
            <span>Заблокировать</span>
          </button>

          <div className="portal__topbarSlot">
            <button
              ref={profileTriggerRef}
              type="button"
              className={`portal__profileTrigger ${profileOpen ? 'is-active' : ''} ${navigationLocked ? 'is-disabled' : ''}`}
              aria-label={navigationLocked ? 'Профиль будет доступен после завершения настройки' : 'Открыть меню профиля'}
              aria-expanded={!navigationLocked && profileOpen}
              aria-controls="portal-profile-menu"
              aria-haspopup="dialog"
              disabled={navigationLocked}
              onClick={() => {
                if (navigationLocked) return;
                setNotificationsOpen(false);
                setProfileOpen((value) => !value);
              }}
            >
              <span className="portal__avatar">
                {profile.avatar ? <img src={profile.avatar} alt="" /> : profile.initials}
              </span>
              <span className="portal__profileCopy">
                <strong>{profile.fullName}</strong>
                <small>{profile.roleLabel || profile.position || 'Пользователь'}</small>
              </span>
              <span className="portal__profileChevron"><ChevronDownIcon /></span>
            </button>
            {!navigationLocked ? (
              <PortalProfileMenu
                open={profileOpen}
                onClose={() => setProfileOpen(false)}
                onLock={onLock}
                triggerRef={profileTriggerRef}
              />
            ) : null}
          </div>
        </div>
      </header>

      {!navigationLocked ? (
        <PortalSearch
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          onLock={onLock}
          onOpenReviews={onOpenReviews}
        />
      ) : null}
    </>
  );
}

export default memo(PortalTopbar);
