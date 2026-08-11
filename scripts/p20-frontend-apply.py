#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P20 frontend patch anchor not found: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')


patch('src/App.jsx', "const ReputationPage = lazy(() => import('./pages/portal/ReputationPage'));\n", "const ReputationPage = lazy(() => import('./pages/portal/ReputationPage'));\nconst CasesPage = lazy(() => import('./pages/portal/CasesPage'));\n")
patch('src/App.jsx', "const protectedPortalPaths = ['/onboarding','/dashboard','/reviews','/reputation','/automations'", "const protectedPortalPaths = ['/onboarding','/dashboard','/reviews','/reputation','/cases','/automations'")
patch('src/App.jsx', "        <Route path=\"/reputation\" element={<LazyRoute><ReputationPage /></LazyRoute>} />\n", "        <Route path=\"/reputation\" element={<LazyRoute><ReputationPage /></LazyRoute>} />\n        <Route path=\"/cases\" element={<LazyRoute><CasesPage /></LazyRoute>} />\n")

patch('src/layouts/PortalLayout/navigation.js', "  { to: '/reputation', label: 'Репутация', Icon: ReputationIcon, permission: 'analytics.view' },\n", "  { to: '/reputation', label: 'Репутация', Icon: ReputationIcon, permission: 'analytics.view' },\n  { to: '/cases', label: 'Кейсы', Icon: ReputationIcon, permission: 'cases.view' },\n")

rbac = ROOT / 'src/services/access/rbacService.js'
text = rbac.read_text(encoding='utf-8')
text = text.replace("      { id: 'reviews.settings', label: 'Настраивать политику', description: 'Режим ответа, tone of voice и автоматизации организации' },\n", "      { id: 'reviews.settings', label: 'Настраивать политику', description: 'Режим ответа, tone of voice и автоматизации организации' },\n      { id: 'cases.view', label: 'Просматривать кейсы', description: 'Репутационные кейсы, SLA, причины и измеримые результаты' },\n      { id: 'cases.manage', label: 'Управлять кейсами', description: 'Триаж, назначение, исполнение, решение и повторное открытие' },\n      { id: 'cases.verify', label: 'Проверять результат кейсов', description: 'Верифицировать эффект и закрывать репутационные кейсы' },\n", 1)
text = text.replace("  'reviews.view',\n  'automations.view',\n", "  'reviews.view',\n  'cases.view',\n  'automations.view',\n", 1)
text = text.replace("      'reviews.view', 'reviews.reply', 'reviews.moderate', 'reviews.legal',\n", "      'reviews.view', 'reviews.reply', 'reviews.moderate', 'reviews.legal',\n      'cases.view', 'cases.manage', 'cases.verify',\n", 1)
text = text.replace("    permissions: ['dashboard.view', 'business.view', 'locations.view', 'reviews.view', 'reviews.reply', 'tasks.view'", "    permissions: ['dashboard.view', 'business.view', 'locations.view', 'reviews.view', 'reviews.reply', 'cases.view', 'tasks.view'", 1)
text = text.replace("  { prefix: '/reputation', permission: 'analytics.view' },\n", "  { prefix: '/reputation', permission: 'analytics.view' },\n  { prefix: '/cases', permission: 'cases.view' },\n", 1)
rbac.write_text(text, encoding='utf-8')
print('patched frontend RBAC')

print('P20 frontend integration patch applied')
