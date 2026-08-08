import React from 'react';
import PortalLayout from '../layouts/PortalLayout';
import { OnboardingWorkspace } from '../features/onboarding';

export default function OnboardingPage() {
  return (
    <PortalLayout
      title="Первый вход"
      subtitle="Настройка кабинета"
      requirePin={false}
      navigationLocked
      showHelp={false}
      immersive
    >
      <OnboardingWorkspace />
    </PortalLayout>
  );
}
