import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import { ProfileWorkspace } from '../../features/profile';

export default function ProfilePage() {
  return (
    <PortalLayout title="Настройки" subtitle="Аккаунт, организация и система">
      <ProfileWorkspace />
    </PortalLayout>
  );
}
