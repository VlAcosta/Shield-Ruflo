import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import { TasksWorkspace } from '../../features/tasks';

export default function TasksPage() {
  return (
    <PortalLayout title="Задачи" subtitle="Управление">
      <TasksWorkspace />
    </PortalLayout>
  );
}
