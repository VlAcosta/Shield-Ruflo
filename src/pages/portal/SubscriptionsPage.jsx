import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import { SubscriptionsWorkspace } from '../../features/subscriptions';

export default function SubscriptionsPage() {
  return (
    <PortalLayout title="Тариф и оплата" subtitle="Настройки">
      <SubscriptionsWorkspace />
    </PortalLayout>
  );
}
