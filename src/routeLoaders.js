export const routeLoaders = Object.freeze({
  '/': () => import('./pages/LandingPage'),
  '/auth': () => import('./pages/AuthPage'),
  '/onboarding': () => import('./pages/OnboardingPage'),
  '/pricing': () => import('./pages/PricingPage'),
  '/dashboard': () => import('./pages/DashboardPage'),
  '/subscriptions': () => import('./pages/portal/SubscriptionsPage'),
  '/reports': () => import('./pages/portal/ReportsPage'),
  '/tasks': () => import('./pages/portal/TasksPage'),
  '/profile': () => import('./pages/portal/ProfilePage'),
  '/notifications': () => import('./pages/portal/NotificationsPage'),
  '/chat': () => import('./pages/portal/ChatPage'),
  '/faq': () => import('./pages/portal/FaqPage'),
});

const preloadCache = new Map();

export function preloadRoute(pathname) {
  const loader = routeLoaders[pathname];
  if (!loader) return Promise.resolve(null);
  if (!preloadCache.has(pathname)) {
    preloadCache.set(pathname, loader().catch((error) => {
      preloadCache.delete(pathname);
      throw error;
    }));
  }
  return preloadCache.get(pathname);
}
