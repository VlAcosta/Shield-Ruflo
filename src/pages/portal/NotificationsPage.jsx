import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import { NotificationsWorkspace } from '../../features/notifications';

export default function NotificationsPage() {
  return (
    <PortalLayout title="Уведомления" subtitle="Центр">
      <NotificationsWorkspace />
    </PortalLayout>
  );
}
