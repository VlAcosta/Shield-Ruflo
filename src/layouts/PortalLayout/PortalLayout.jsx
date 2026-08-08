import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import PortalSidebar from './components/PortalSidebar';
import PortalTopbar from './components/PortalTopbar';
import PinOverlay from './components/PinOverlay';
import usePortalAutoLock from './hooks/usePortalAutoLock';
import useCompanyPresence from './hooks/useCompanyPresence';
import useMemberSecurityGate from '../../features/access/hooks/useMemberSecurityGate';
import MemberAccessOverlay from './components/MemberAccessOverlay';
import useAutomationRuntime from '../../features/automations/hooks/useAutomationRuntime';
import useAppearance from '../../features/appearance/hooks/useAppearance';
import { PIN_CODE_KEY, PIN_UNLOCK_KEY } from './constants';
import './PortalLayout.scss';
import '../../styles/dashboardDark.scss';
import '../../styles/portalAppearance.scss';

let reviewsDrawerPromise;

function loadReviewsDrawer() {
  if (!reviewsDrawerPromise) {
    reviewsDrawerPromise = import('./components/PortalReviewsDrawer');
  }
  return reviewsDrawerPromise;
}

const PortalReviewsDrawer = lazy(loadReviewsDrawer);

function ReviewsDrawerFallback({ onClose }) {
  return (
    <div className="portal-reviews-fallback">
      <button type="button" className="portal-reviews-fallback__overlay" onClick={onClose} aria-label="Закрыть новые отзывы" />
      <aside className="portal-reviews-fallback__panel" aria-label="Загрузка отзывов">
        <div className="portal-reviews-fallback__head"><i /><span /></div>
        <div className="portal-reviews-fallback__body">
          {Array.from({ length: 5 }).map((_, index) => <i key={index} />)}
        </div>
      </aside>
    </div>
  );
}

export default function PortalLayout({
  title = '',
  subtitle = '',
  children,
  requirePin = true,
  navigationLocked = false,
  immersive = false,
}) {
  const location = useLocation();
  const appearance = useAppearance({ applyDocument: !immersive });
  const portalRef = useRef(null);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [lockReason, setLockReason] = useState('');
  const [pinUnlocked, setPinUnlocked] = useState(() => localStorage.getItem(PIN_UNLOCK_KEY) === '1');
  const hasPin = Boolean(localStorage.getItem(PIN_CODE_KEY));
  const memberSecurity = useMemberSecurityGate(!immersive);
  const accessBlocked = Boolean(memberSecurity?.blocked);

  useCompanyPresence(location.pathname, !immersive && !navigationLocked && !accessBlocked);
  useAutomationRuntime(!immersive && !navigationLocked && !accessBlocked);

  useEffect(() => {
    if (!requirePin) return;
    setPinUnlocked(localStorage.getItem(PIN_UNLOCK_KEY) === '1');
  }, [location.pathname, requirePin]);

  const unlockPin = useCallback(() => {
    localStorage.setItem(PIN_UNLOCK_KEY, '1');
    setLockReason('');
    setPinUnlocked(true);
  }, []);

  const lockPortal = useCallback((reason = 'manual') => {
    localStorage.removeItem(PIN_UNLOCK_KEY);
    setReviewsOpen(false);
    setLockReason(reason);
    setPinUnlocked(false);
  }, []);

  const pinLocked = requirePin && (!pinUnlocked || !hasPin);
  const locked = pinLocked || accessBlocked;
  const content = children ?? <Outlet />;

  usePortalAutoLock({
    enabled: requirePin && hasPin && pinUnlocked && !navigationLocked && !accessBlocked,
    onLock: lockPortal,
  });

  useEffect(() => {
    const root = portalRef.current;
    if (!root) return undefined;

    const backgroundNodes = Array.from(root.children).filter((node) => (
      node.classList.contains('portal__sidebar')
      || node.classList.contains('portal__contentWrap')
    ));

    backgroundNodes.forEach((node) => {
      if (locked) {
        node.setAttribute('inert', '');
        node.setAttribute('aria-hidden', 'true');
      } else {
        node.removeAttribute('inert');
        node.removeAttribute('aria-hidden');
      }
    });

    return () => {
      backgroundNodes.forEach((node) => {
        node.removeAttribute('inert');
        node.removeAttribute('aria-hidden');
      });
    };
  }, [locked]);

  return (
    <div
      ref={portalRef}
      className={`portal ${locked ? 'portal--locked' : ''} ${navigationLocked ? 'portal--navigation-locked' : ''} ${immersive ? 'portal--immersive' : ''} ${appearance.isDark ? 'portal--theme-dark' : 'portal--theme-light'}`.trim()}
    >
      {!immersive ? <PortalSidebar onLock={lockPortal} navigationLocked={navigationLocked} /> : null}

      <div className="portal__contentWrap">
        {!immersive ? (
          <PortalTopbar
            title={title}
            subtitle={subtitle}
            onOpenReviews={() => setReviewsOpen(true)}
            onPreloadReviews={loadReviewsDrawer}
            onLock={lockPortal}
            navigationLocked={navigationLocked}
            canLock={requirePin && hasPin}
          />
        ) : null}
        <main className={`portal__page portal__page--relative ${immersive ? 'portal__page--immersive' : ''}`.trim()}>{content}</main>
      </div>

      {!immersive && reviewsOpen && !locked ? (
        <Suspense fallback={<ReviewsDrawerFallback onClose={() => setReviewsOpen(false)} />}>
          <PortalReviewsDrawer open onClose={() => setReviewsOpen(false)} />
        </Suspense>
      ) : null}
      {accessBlocked ? <MemberAccessOverlay reason={memberSecurity.reason} security={memberSecurity.security} /> : null}
      {!accessBlocked && pinLocked ? <PinOverlay onUnlock={unlockPin} reason={lockReason} /> : null}
    </div>
  );
}
