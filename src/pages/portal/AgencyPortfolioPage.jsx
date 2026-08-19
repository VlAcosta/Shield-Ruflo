import PortalLayout from '../../layouts/PortalLayout';
import AgencyPortfolioWorkspace from '../../features/agency/AgencyPortfolioWorkspace';

export default function AgencyPortfolioPage() {
  return (
    <PortalLayout title="Портфель агентства" subtitle="Enterprise">
      <AgencyPortfolioWorkspace />
    </PortalLayout>
  );
}
