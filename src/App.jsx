import './App.css';
import './scss/main.scss';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { initScrollReveal } from './animations/scrollReveal';

import HeaderAnalytick from './components/analytick-blocks/user-block/header_block.jsx';
import { AccessDenied, useAccessControl } from './features/access';
import { findFirstAllowedRoute, getRoutePermission } from './services/access/rbacService';
import PortalLayout from './layouts/PortalLayout';
import { authService } from './services/auth/authService';
import { adminAccessService } from './services/admin/adminAccessService';
import { AUTH_SESSION_INVALID_EVENT } from './services/core/apiClient';
import { ORGANIZATION_CONTEXT_CHANGED_EVENT } from './features/access/hooks/useOrganizationContext';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SubscriptionsPage = lazy(() => import('./pages/portal/SubscriptionsPage'));
const ReportsPage = lazy(() => import('./pages/portal/ReportsPage'));
const TasksPage = lazy(() => import('./pages/portal/TasksPage'));
const ProfilePage = lazy(() => import('./pages/portal/ProfilePage'));
const KnowledgeBasePage = lazy(() => import('./pages/portal/KnowledgeBasePage'));
const NotificationsPage = lazy(() => import('./pages/portal/NotificationsPage'));
const ChatPage = lazy(() => import('./pages/portal/ChatPage'));
const VideoPage = lazy(() => import('./pages/portal/VideoConsultationsPage'));
const FaqPage = lazy(() => import('./pages/portal/FaqPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const ReviewsPage = lazy(() => import('./pages/portal/ReviewsPage'));
const ReputationPage = lazy(() => import('./pages/portal/ReputationPage'));
const CasesPage = lazy(() => import('./pages/portal/CasesPage'));
const ReviewAcquisitionPage = lazy(() => import('./pages/portal/ReviewAcquisitionPage'));
const ReviewAcquisitionLandingPage = lazy(() => import('./pages/ReviewAcquisitionLandingPage'));
const AutomationsPage = lazy(() => import('./pages/portal/AutomationsPage'));
const IntegrationsPage = lazy(() => import('./pages/portal/IntegrationsPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminClientsPage = lazy(() => import('./pages/admin/AdminClientsPage'));
const AdminClientDetailsPage = lazy(() => import('./pages/admin/AdminClientDetailsPage'));
const AdminManagersPage = lazy(() => import('./pages/admin/AdminManagersPage'));
const AdminTicketsPage = lazy(() => import('./pages/admin/AdminTicketsPage'));
const AdminSubscriptionsPage = lazy(() => import('./pages/admin/AdminSubscriptionsPage'));
const AdminAnalyticsPage = lazy(() => import('./pages/admin/AdminAnalyticsPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));

const protectedPortalPaths = ['/onboarding','/dashboard','/reviews','/reputation','/cases','/acquisition','/automations','/integrations','/subscriptions','/reports','/tasks','/profile','/knowledge-base','/notifications','/chat','/video-consultations','/faq','/blocked','/access-denied'];

function RouteFallback({ tone = 'portal' }) {
  return <div className={`route-fallback route-fallback--${tone}`} role="status" aria-live="polite" aria-label="Загрузка раздела"><span /><span /><span /></div>;
}

function LazyRoute({ children, tone = 'portal' }) {
  return <Suspense fallback={<RouteFallback tone={tone} />}>{children}</Suspense>;
}

function PortalAccessDeniedPage() {
  return (
    <PortalLayout title="Доступ ограничен" subtitle="Безопасность">
      <AccessDenied />
    </PortalLayout>
  );
}

function AdminAccessState({ type }) {
  const denied = type === 'denied';
  return (
    <main className="route-loader route-loader--admin" role="alert">
      <strong>{denied ? 'Доступ к админ-панели запрещён' : 'Не удалось проверить доступ администратора'}</strong>
      <span>{denied ? 'Эта учётная запись не входит в серверный список администраторов платформы.' : 'Сервер авторизации временно недоступен. Доступ к админ-панели не предоставлен.'}</span>
      {!denied ? <button type="button" onClick={() => window.location.reload()}>Повторить</button> : null}
    </main>
  );
}

function App() {
  const location = useLocation();
  const access = useAccessControl();
  const [sessionState, setSessionState] = useState('checking');
  const [adminAccessState, setAdminAccessState] = useState('idle');
  const [organizationVersion, setOrganizationVersion] = useState(0);

  useEffect(() => { initScrollReveal(); }, []);

  const isAdmin = location.pathname.startsWith('/admin');
  const protectedPortalRoute = protectedPortalPaths.some((path) => (
    location.pathname === path || location.pathname.startsWith(`${path}/`)
  ));
  const isPortal = protectedPortalRoute;
  const requiresSession = protectedPortalRoute || isAdmin;
  const onboardingCompleted = access.membership?.organization?.onboardingStatus === 'COMPLETED';

  useEffect(() => {
    const invalidateSession = () => {
      authService.clearLocalSession();
      setSessionState('unauthenticated');
      setAdminAccessState('idle');
    };
    window.addEventListener(AUTH_SESSION_INVALID_EVENT, invalidateSession);
    return () => window.removeEventListener(AUTH_SESSION_INVALID_EVENT, invalidateSession);
  }, []);

  useEffect(() => {
    const refreshTenantView = () => setOrganizationVersion((value) => value + 1);
    window.addEventListener(ORGANIZATION_CONTEXT_CHANGED_EVENT, refreshTenantView);
    return () => window.removeEventListener(ORGANIZATION_CONTEXT_CHANGED_EVENT, refreshTenantView);
  }, []);

  useEffect(() => {
    if (!requiresSession) {
      setSessionState('idle');
      return undefined;
    }
    const controller = new AbortController();
    setSessionState('checking');
    authService.restoreSession({ signal: controller.signal })
      .then(() => setSessionState('authenticated'))
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          setSessionState(error?.status === 401 ? 'unauthenticated' : 'unavailable');
        }
      });
    return () => controller.abort();
  }, [requiresSession]);

  useEffect(() => {
    if (!isAdmin) {
      setAdminAccessState('idle');
      return undefined;
    }
    if (sessionState !== 'authenticated') {
      setAdminAccessState('idle');
      return undefined;
    }

    const controller = new AbortController();
    setAdminAccessState('checking');
    adminAccessService.check({ signal: controller.signal })
      .then((allowed) => setAdminAccessState(allowed ? 'allowed' : 'denied'))
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setAdminAccessState(error?.status === 403 ? 'denied' : 'unavailable');
      });
    return () => controller.abort();
  }, [isAdmin, sessionState]);

  if (requiresSession && sessionState === 'checking') {
    return <RouteFallback tone={isAdmin ? 'admin' : 'portal'} />;
  }

  if (requiresSession && sessionState === 'unauthenticated') {
    const next = encodeURIComponent(`${location.pathname}${location.search || ''}`);
    return <Navigate to={`/auth?mode=login&next=${next}`} replace />;
  }

  if (requiresSession && sessionState === 'unavailable') {
    return (
      <main className={`route-loader route-loader--${isAdmin ? 'admin' : 'portal'}`} role="alert">
        <strong>Сервис временно недоступен</strong>
        <span>Не удалось проверить сессию. Проверьте соединение и повторите попытку.</span>
        <button type="button" onClick={() => window.location.reload()}>Повторить</button>
      </main>
    );
  }

  if (isAdmin && sessionState === 'authenticated' && ['idle', 'checking'].includes(adminAccessState)) {
    return <RouteFallback tone="admin" />;
  }

  if (isAdmin && adminAccessState === 'denied') {
    return <AdminAccessState type="denied" />;
  }

  if (isAdmin && adminAccessState === 'unavailable') {
    return <AdminAccessState type="unavailable" />;
  }

  if (protectedPortalRoute && location.pathname !== '/onboarding' && !onboardingCompleted) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />;
  }

  if (location.pathname === '/onboarding' && onboardingCompleted) {
    return <Navigate to={findFirstAllowedRoute(access)} replace />;
  }

  const requiredPermission = getRoutePermission(location.pathname);
  if (onboardingCompleted && requiredPermission && !access.can(requiredPermission)) {
    const deniedParams = new URLSearchParams({ from: `${location.pathname}${location.search || ''}` });
    return <Navigate to={`/access-denied?${deniedParams.toString()}`} replace />;
  }

  return (
    <div className={`App ${isPortal ? 'app-portal' : ''} ${isAdmin ? 'app-admin' : ''}`}>
      <Routes key={organizationVersion}>
        <Route path="/" element={<Suspense fallback={<div className="landing-route-loader" aria-label="Загрузка главной страницы"><span /></div>}><LandingPage /></Suspense>} />
        <Route path="/auth" element={<Suspense fallback={<div style={{minHeight:'100vh',background:'#f7f8fc'}} />}><AuthPage /></Suspense>} />
        <Route path="/onboarding" element={<LazyRoute><OnboardingPage /></LazyRoute>} />
        <Route path="/pricing" element={<Suspense fallback={<div style={{minHeight:'100vh',background:'#f7f8fc'}} />}><PricingPage /></Suspense>} />
        <Route path="/r/:slug" element={<Suspense fallback={<div style={{minHeight:'100vh',background:'#f6f7fb'}} />}><ReviewAcquisitionLandingPage /></Suspense>} />
        <Route path="/dashboard" element={<LazyRoute><DashboardPage /></LazyRoute>} />
        <Route path="/reviews" element={<LazyRoute><ReviewsPage /></LazyRoute>} />
        <Route path="/reputation" element={<LazyRoute><ReputationPage /></LazyRoute>} />
        <Route path="/cases" element={<LazyRoute><CasesPage /></LazyRoute>} />
        <Route path="/acquisition" element={<LazyRoute><ReviewAcquisitionPage /></LazyRoute>} />
        <Route path="/automations" element={<LazyRoute><AutomationsPage /></LazyRoute>} />
        <Route path="/integrations" element={<LazyRoute><IntegrationsPage /></LazyRoute>} />
        <Route path="/subscriptions" element={<LazyRoute><SubscriptionsPage /></LazyRoute>} />
        <Route path="/reports" element={<LazyRoute><ReportsPage /></LazyRoute>} />
        <Route path="/tasks" element={<LazyRoute><TasksPage /></LazyRoute>} />
        <Route path="/profile" element={<LazyRoute><ProfilePage /></LazyRoute>} />
        <Route path="/knowledge-base" element={<LazyRoute><KnowledgeBasePage /></LazyRoute>} />
        <Route path="/notifications" element={<LazyRoute><NotificationsPage /></LazyRoute>} />
        <Route path="/chat" element={<LazyRoute><ChatPage /></LazyRoute>} />
        <Route path="/video-consultations" element={<LazyRoute><VideoPage /></LazyRoute>} />
        <Route path="/video" element={<Navigate to="/video-consultations" replace />} />
        <Route path="/faq" element={<LazyRoute><FaqPage /></LazyRoute>} />
        <Route path="/access-denied" element={<PortalAccessDeniedPage />} />
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<Suspense fallback={<RouteFallback tone="admin" />}><AdminDashboardPage /></Suspense>} />
        <Route path="/admin/clients" element={<Suspense fallback={<RouteFallback tone="admin" />}><AdminClientsPage /></Suspense>} />
        <Route path="/admin/clients/:clientId" element={<Suspense fallback={<RouteFallback tone="admin" />}><AdminClientDetailsPage /></Suspense>} />
        <Route path="/admin/managers" element={<Suspense fallback={<RouteFallback tone="admin" />}><AdminManagersPage /></Suspense>} />
        <Route path="/admin/tickets" element={<Suspense fallback={<RouteFallback tone="admin" />}><AdminTicketsPage /></Suspense>} />
        <Route path="/admin/subscriptions" element={<Suspense fallback={<RouteFallback tone="admin" />}><AdminSubscriptionsPage /></Suspense>} />
        <Route path="/admin/analytics" element={<Suspense fallback={<RouteFallback tone="admin" />}><AdminAnalyticsPage /></Suspense>} />
        <Route path="/admin/settings" element={<Suspense fallback={<RouteFallback tone="admin" />}><AdminSettingsPage /></Suspense>} />
        <Route path="/help" element={<Navigate to="/faq" replace />} />
        <Route path="/analytick_block" element={<HeaderAnalytick to="/analytick_block" replace/>} />
        <Route path="*" element={<Navigate to={findFirstAllowedRoute(access)} replace />} />
      </Routes>
    </div>
  );
}

export default App;
