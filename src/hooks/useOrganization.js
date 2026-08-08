import { useEffect, useState } from 'react';
import { readJson } from '../utils/storage';

const ORGANIZATION_FALLBACK = Object.freeze({
  title: 'Организация',
});

function readOrganization() {
  return readJson('organization', ORGANIZATION_FALLBACK);
}

export default function useOrganization() {
  const [organization, setOrganization] = useState(readOrganization);

  useEffect(() => {
    const refresh = () => setOrganization(readOrganization());
    const handleStorage = (event) => {
      if (!event.key || event.key === 'organization') refresh();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('business-shield:organization-changed', refresh);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('business-shield:organization-changed', refresh);
    };
  }, []);

  return organization;
}
