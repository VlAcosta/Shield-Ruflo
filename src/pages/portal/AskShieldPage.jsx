import PortalLayout from '../../layouts/PortalLayout';
import AskShieldWorkspace from '../../features/ask-shield/AskShieldWorkspace';

export default function AskShieldPage() {
  return (
    <PortalLayout title="Ask Shield" subtitle="Business Intelligence">
      <AskShieldWorkspace />
    </PortalLayout>
  );
}
