import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import ReviewAcquisitionWorkspace from '../../features/acquisition/ReviewAcquisitionWorkspace';

export default function ReviewAcquisitionPage() {
  return (
    <PortalLayout title="Сбор отзывов" subtitle="Review Acquisition">
      <ReviewAcquisitionWorkspace />
    </PortalLayout>
  );
}
