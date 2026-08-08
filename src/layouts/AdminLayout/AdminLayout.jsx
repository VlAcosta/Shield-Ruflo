import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './components/AdminSidebar';
import AdminTopbar from './components/AdminTopbar';
import AdminPinOverlay from './components/AdminPinOverlay';
import './AdminLayout.scss';

const ADMIN_UNLOCK_KEY = 'business-shield:admin-unlocked';

export default function AdminLayout({ children, title = 'Дашборд', eyebrow = 'Обзор системы', searchItems = [], onRefresh }) {
  const rootRef = useRef(null);
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(ADMIN_UNLOCK_KEY) === '1');

  const lock = useCallback(() => {
    sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
    setUnlocked(false);
  }, []);

  const unlock = useCallback(() => {
    sessionStorage.setItem(ADMIN_UNLOCK_KEY, '1');
    setUnlocked(true);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const nodes = Array.from(root.children).filter((node) => !node.classList.contains('admin-pin'));
    nodes.forEach((node) => {
      if (!unlocked) {
        node.setAttribute('inert', '');
        node.setAttribute('aria-hidden', 'true');
      } else {
        node.removeAttribute('inert');
        node.removeAttribute('aria-hidden');
      }
    });
    return () => nodes.forEach((node) => { node.removeAttribute('inert'); node.removeAttribute('aria-hidden'); });
  }, [unlocked]);

  return (
    <div ref={rootRef} className={`admin-shell ${unlocked ? '' : 'admin-shell--locked'}`}>
      <AdminSidebar onLock={lock} />
      <div className="admin-shell__content">
        <AdminTopbar eyebrow={eyebrow} title={title} onLock={lock} searchItems={searchItems} onRefresh={onRefresh} />
        <main className="admin-shell__page">{children ?? <Outlet />}</main>
      </div>
      {!unlocked ? <AdminPinOverlay onUnlock={unlock} /> : null}
    </div>
  );
}
