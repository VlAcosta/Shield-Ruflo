#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P21 frontend patch anchor not found: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')


patch('src/App.jsx', "const CasesPage = lazy(() => import('./pages/portal/CasesPage'));\n", "const CasesPage = lazy(() => import('./pages/portal/CasesPage'));\nconst ReviewAcquisitionPage = lazy(() => import('./pages/portal/ReviewAcquisitionPage'));\nconst ReviewAcquisitionLandingPage = lazy(() => import('./pages/ReviewAcquisitionLandingPage'));\n")
patch('src/App.jsx', "const protectedPortalPaths = ['/onboarding','/dashboard','/reviews','/reputation','/cases','/automations'", "const protectedPortalPaths = ['/onboarding','/dashboard','/reviews','/reputation','/cases','/acquisition','/automations'")
patch('src/App.jsx', "        <Route path=\"/pricing\" element={<Suspense fallback={<div style={{minHeight:'100vh',background:'#f7f8fc'}} />}><PricingPage /></Suspense>} />\n", "        <Route path=\"/pricing\" element={<Suspense fallback={<div style={{minHeight:'100vh',background:'#f7f8fc'}} />}><PricingPage /></Suspense>} />\n        <Route path=\"/r/:slug\" element={<Suspense fallback={<div style={{minHeight:'100vh',background:'#f6f7fb'}} />}><ReviewAcquisitionLandingPage /></Suspense>} />\n")
patch('src/App.jsx', "        <Route path=\"/cases\" element={<LazyRoute><CasesPage /></LazyRoute>} />\n", "        <Route path=\"/cases\" element={<LazyRoute><CasesPage /></LazyRoute>} />\n        <Route path=\"/acquisition\" element={<LazyRoute><ReviewAcquisitionPage /></LazyRoute>} />\n")

patch('src/layouts/PortalLayout/navigation.js', "  { to: '/cases', label: 'Кейсы', Icon: ReputationIcon, permission: 'cases.view' },\n", "  { to: '/cases', label: 'Кейсы', Icon: ReputationIcon, permission: 'cases.view' },\n  { to: '/acquisition', label: 'Сбор отзывов', Icon: ReviewsIcon, permission: 'acquisition.view' },\n")

rbac = ROOT / 'src/services/access/rbacService.js'
text = rbac.read_text(encoding='utf-8')
text = text.replace("      { id: 'cases.verify', label: 'Проверять результат кейсов', description: 'Верифицировать эффект и закрывать репутационные кейсы' },\n", "      { id: 'cases.verify', label: 'Проверять результат кейсов', description: 'Верифицировать эффект и закрывать репутационные кейсы' },\n      { id: 'acquisition.view', label: 'Просматривать сбор отзывов', description: 'Кампании, QR, конверсия и агрегированные метрики' },\n      { id: 'acquisition.manage', label: 'Управлять сбором отзывов', description: 'Создавать кампании и ссылки, запускать сбор и работать с first-party feedback' },\n", 1)
text = text.replace("  'cases.view',\n  'automations.view',\n", "  'cases.view',\n  'acquisition.view',\n  'automations.view',\n", 1)
text = text.replace("      'cases.view', 'cases.manage', 'cases.verify',\n", "      'cases.view', 'cases.manage', 'cases.verify',\n      'acquisition.view', 'acquisition.manage',\n", 1)
text = text.replace("    permissions: ['dashboard.view', 'business.view', 'locations.view', 'reviews.view', 'reviews.reply', 'cases.view', 'tasks.view'", "    permissions: ['dashboard.view', 'business.view', 'locations.view', 'reviews.view', 'reviews.reply', 'cases.view', 'acquisition.view', 'tasks.view'", 1)
text = text.replace("  { prefix: '/cases', permission: 'cases.view' },\n", "  { prefix: '/cases', permission: 'cases.view' },\n  { prefix: '/acquisition', permission: 'acquisition.view' },\n", 1)
rbac.write_text(text, encoding='utf-8')
print('patched frontend acquisition RBAC')

print('P21 frontend integration patch applied')
