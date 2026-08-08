import { useEffect, useRef } from 'react';
import { markCurrentLogin, recordCompanyActivity, touchCurrentPresence } from '../../../services/activity/companyActivityService';
import { registerCurrentMemberSession, touchCurrentMemberSession } from '../../../services/security/teamSecurityService';

const ROUTE_LABELS = {
  '/dashboard': 'Главная',
  '/reviews': 'Отзывы',
  '/reputation': 'Репутация',
  '/automations': 'Автоматизации',
  '/integrations': 'Интеграции',
  '/subscriptions': 'Подписки',
  '/reports': 'Отчёты',
  '/tasks': 'Задачи',
  '/profile': 'Профиль',
  '/chat': 'Поддержка',
  '/faq': 'FAQ',
};

function routeLabel(pathname = '') {
  const key = Object.keys(ROUTE_LABELS).find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return key ? ROUTE_LABELS[key] : 'Кабинет';
}

export default function useCompanyPresence(pathname, enabled = true) {
  const lastTouchRef = useRef(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!initializedRef.current) {
      initializedRef.current = true;
      markCurrentLogin({ route: pathname, device: navigator.userAgent.includes('Mobile') ? 'Мобильное устройство' : 'Браузер' });
      registerCurrentMemberSession({ route: pathname });
    } else {
      touchCurrentPresence({ route: pathname });
      touchCurrentMemberSession({ route: pathname });
    }
    recordCompanyActivity({ type: 'navigation', title: `Открыл раздел «${routeLabel(pathname)}»`, route: pathname });
    return undefined;
  }, [enabled, pathname]);

  useEffect(() => {
    if (!enabled) return undefined;
    const touch = () => {
      const now = Date.now();
      if (now - lastTouchRef.current < 20000) return;
      lastTouchRef.current = now;
      touchCurrentPresence({ route: pathname });
      touchCurrentMemberSession({ route: pathname });
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, touch, { passive: true }));
    const timer = window.setInterval(touch, 45000);
    const visibility = () => { if (!document.hidden) touch(); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, touch));
      document.removeEventListener('visibilitychange', visibility);
      window.clearInterval(timer);
    };
  }, [enabled, pathname]);
}
