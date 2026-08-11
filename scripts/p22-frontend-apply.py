#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P22 frontend patch anchor not found: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')


patch('src/App.jsx', "const ReviewAcquisitionPage = lazy(() => import('./pages/portal/ReviewAcquisitionPage'));\n", "const ReviewAcquisitionPage = lazy(() => import('./pages/portal/ReviewAcquisitionPage'));\nconst CompetitiveIntelligencePage = lazy(() => import('./pages/portal/CompetitiveIntelligencePage'));\n")
patch('src/App.jsx', "const protectedPortalPaths = ['/onboarding','/dashboard','/reviews','/reputation','/cases','/acquisition','/automations'", "const protectedPortalPaths = ['/onboarding','/dashboard','/reviews','/reputation','/cases','/acquisition','/competitive','/automations'")
patch('src/App.jsx', "        <Route path=\"/acquisition\" element={<LazyRoute><ReviewAcquisitionPage /></LazyRoute>} />\n", "        <Route path=\"/acquisition\" element={<LazyRoute><ReviewAcquisitionPage /></LazyRoute>} />\n        <Route path=\"/competitive\" element={<LazyRoute><CompetitiveIntelligencePage /></LazyRoute>} />\n")

patch('src/layouts/PortalLayout/navigation.js', "  { to: '/acquisition', label: 'Сбор отзывов', Icon: ReviewsIcon, permission: 'acquisition.view' },\n", "  { to: '/acquisition', label: 'Сбор отзывов', Icon: ReviewsIcon, permission: 'acquisition.view' },\n  { to: '/competitive', label: 'Конкуренты', Icon: ReputationIcon, permission: 'competitive.view' },\n")

rbac = ROOT / 'src/services/access/rbacService.js'
text = rbac.read_text(encoding='utf-8')
text = text.replace("      { id: 'acquisition.manage', label: 'Управлять сбором отзывов', description: 'Создавать кампании и ссылки, запускать сбор и работать с first-party feedback' },\n", "      { id: 'acquisition.manage', label: 'Управлять сбором отзывов', description: 'Создавать кампании и ссылки, запускать сбор и работать с first-party feedback' },\n      { id: 'competitive.view', label: 'Просматривать конкурентов', description: 'Benchmark, coverage и метрики конкурентов' },\n      { id: 'competitive.manage', label: 'Управлять конкурентами', description: 'Добавлять конкурентов, источники и persistable snapshots' },\n", 1)
text = text.replace("  'acquisition.view',\n  'automations.view',\n", "  'acquisition.view',\n  'competitive.view',\n  'automations.view',\n", 1)
text = text.replace("      'acquisition.view', 'acquisition.manage',\n", "      'acquisition.view', 'acquisition.manage',\n      'competitive.view', 'competitive.manage',\n", 1)
text = text.replace("    permissions: ['dashboard.view', 'business.view', 'locations.view', 'reviews.view', 'reviews.reply', 'cases.view', 'acquisition.view', 'tasks.view'", "    permissions: ['dashboard.view', 'business.view', 'locations.view', 'reviews.view', 'reviews.reply', 'cases.view', 'acquisition.view', 'competitive.view', 'tasks.view'", 1)
text = text.replace("  { prefix: '/acquisition', permission: 'acquisition.view' },\n", "  { prefix: '/acquisition', permission: 'acquisition.view' },\n  { prefix: '/competitive', permission: 'competitive.view' },\n", 1)
rbac.write_text(text, encoding='utf-8')
print('patched frontend competitive RBAC')

print('P22 frontend integration patch applied')
