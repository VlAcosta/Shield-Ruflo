import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import { SupportChatWorkspace } from '../../features/support';

export default function ChatPage() {
  return (
    <PortalLayout title="Чат с поддержкой" subtitle="Поддержка">
      <SupportChatWorkspace />
    </PortalLayout>
  );
}
