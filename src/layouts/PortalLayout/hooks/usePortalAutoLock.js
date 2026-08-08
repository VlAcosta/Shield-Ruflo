import { useEffect, useRef, useState } from 'react';
import {
  readSecurityPreferences,
  SECURITY_PREFERENCES_CHANGED_EVENT,
} from '../../../services/security/securityPreferencesService';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
const MOVEMENT_THROTTLE_MS = 1200;

export default function usePortalAutoLock({ enabled, onLock }) {
  const [preferences, setPreferences] = useState(readSecurityPreferences);
  const lastActivityRef = useRef(Date.now());
  const timeoutRef = useRef(null);
  const movementThrottleRef = useRef(0);

  useEffect(() => {
    const refresh = () => setPreferences(readSecurityPreferences());
    window.addEventListener(SECURITY_PREFERENCES_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SECURITY_PREFERENCES_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;

    if (!enabled || !preferences.autoLock) return undefined;

    const timeoutMs = preferences.sessionMinutes * 60 * 1000;

    const schedule = () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, timeoutMs - elapsed);
      timeoutRef.current = window.setTimeout(() => {
        if (Date.now() - lastActivityRef.current >= timeoutMs) onLock?.('inactivity');
        else schedule();
      }, remaining || 50);
    };

    const markActivity = () => {
      lastActivityRef.current = Date.now();
      schedule();
    };

    const onPointerMove = () => {
      const now = Date.now();
      if (now - movementThrottleRef.current < MOVEMENT_THROTTLE_MS) return;
      movementThrottleRef.current = now;
      markActivity();
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        onLock?.('inactivity');
        return;
      }
      schedule();
    };

    lastActivityRef.current = Date.now();
    schedule();
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, onLock, preferences.autoLock, preferences.sessionMinutes]);

  return preferences;
}
