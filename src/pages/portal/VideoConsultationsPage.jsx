import React from 'react';
import { Navigate } from 'react-router-dom';

export default function VideoConsultationsPage() {
  return <Navigate to="/chat?channel=manager" replace />;
}
