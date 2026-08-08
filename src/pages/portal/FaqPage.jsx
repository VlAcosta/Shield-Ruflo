import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import { FaqWorkspace } from '../../features/support';

export default function FaqPage() {
  return (
    <PortalLayout title="FAQ" subtitle="Помощь">
      <FaqWorkspace />
    </PortalLayout>
  );
}
