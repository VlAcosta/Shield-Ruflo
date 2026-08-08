import { useEffect, useState } from 'react';
import {
  getCachedUnreadCount,
  NOTIFICATION_BADGE_EVENT,
} from '../services/notifications/notificationService';

export default function useNotificationBadge() {
  const [count, setCount] = useState(() => getCachedUnreadCount());

  useEffect(() => {
    const handleUpdate = (event) => {
      setCount(Number(event.detail?.unreadCount || 0));
    };

    const handleStorage = (event) => {
      if (event.key?.includes('business-shield:notifications')) {
        setCount(getCachedUnreadCount());
      }
    };

    window.addEventListener(NOTIFICATION_BADGE_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(NOTIFICATION_BADGE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return count;
}
