import PortalLayout from '../../layouts/PortalLayout';
import ListingHealthWorkspace from '../../features/listings/ListingHealthWorkspace';

export default function ListingHealthPage() {
  return (
    <PortalLayout title="Location Health" subtitle="Listings">
      <ListingHealthWorkspace />
    </PortalLayout>
  );
}
