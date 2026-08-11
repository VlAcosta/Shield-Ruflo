import PortalLayout from '../../layouts/PortalLayout';
import AiVisibilityWorkspace from '../../features/ai-visibility/AiVisibilityWorkspace';

export default function AiVisibilityPage() {
  return (
    <PortalLayout title="AI Visibility" subtitle="Discovery Intelligence">
      <AiVisibilityWorkspace />
    </PortalLayout>
  );
}
