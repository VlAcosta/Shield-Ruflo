import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import { SubscriptionsWorkspace } from '../../features/subscriptions';
import SubscriptionUpgradeContext from '../../features/subscriptions/SubscriptionUpgradeContext/SubscriptionUpgradeContext';

export default function SubscriptionsPage() {
  return (
    <PortalLayout title="Тариф и оплата" subtitle="Настройки">
      <SubscriptionUpgradeContext />
      <SubscriptionsWorkspace />
    </PortalLayout>
  );
}
