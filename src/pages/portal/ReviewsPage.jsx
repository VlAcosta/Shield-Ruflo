import React from 'react';
import PortalLayout from '../../layouts/PortalLayout';
import ReviewsIntelligenceWorkspace from '../../features/reviews/ReviewsIntelligence';

export default function ReviewsPage() {
  return (
    <PortalLayout title="Отзывы" subtitle="Репутация">
      <ReviewsIntelligenceWorkspace />
    </PortalLayout>
  );
}
