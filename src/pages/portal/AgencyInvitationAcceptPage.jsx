import PortalLayout from '../../layouts/PortalLayout';
import AgencyInvitationAcceptWorkspace from '../../features/agency/AgencyInvitationAcceptWorkspace';

export default function AgencyInvitationAcceptPage() {
  return (
    <PortalLayout title="Подтверждение доступа" subtitle="Enterprise" requirePin={false}>
      <AgencyInvitationAcceptWorkspace />
    </PortalLayout>
  );
}
