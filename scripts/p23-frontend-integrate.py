#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def patch(path, old, new, label):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if new in text:
        print(f'{label}: already integrated')
        return
    if old not in text:
        raise SystemExit(f'{label}: anchor not found')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'{label}: integrated')

patch('src/App.jsx',
      "const CompetitiveIntelligencePage = lazy(() => import('./pages/portal/CompetitiveIntelligencePage'));\n",
      "const CompetitiveIntelligencePage = lazy(() => import('./pages/portal/CompetitiveIntelligencePage'));\nconst AiVisibilityPage = lazy(() => import('./pages/portal/AiVisibilityPage'));\n",
      'App import')
patch('src/App.jsx',
      "'/acquisition','/competitive','/automations'",
      "'/acquisition','/competitive','/ai-visibility','/automations'",
      'protected route')
patch('src/App.jsx',
      '        <Route path="/competitive" element={<LazyRoute><CompetitiveIntelligencePage /></LazyRoute>} />\n',
      '        <Route path="/competitive" element={<LazyRoute><CompetitiveIntelligencePage /></LazyRoute>} />\n        <Route path="/ai-visibility" element={<LazyRoute><AiVisibilityPage /></LazyRoute>} />\n',
      'route registration')

rbac = ROOT / 'src/services/access/rbacService.js'
r = rbac.read_text(encoding='utf-8')
if "{ id: 'ai_visibility.view'" not in r:
    anchor = "      { id: 'competitive.manage', label: 'Управлять конкурентами', description: 'Добавлять конкурентов, источники и persistable snapshots' },\n"
    addition = anchor + "      { id: 'ai_visibility.view', label: 'Просматривать AI Visibility', description: 'Probe library, evidence и агрегированные GEO-метрики' },\n      { id: 'ai_visibility.manage', label: 'Управлять AI Visibility', description: 'Создавать и изменять discovery probes' },\n      { id: 'ai_visibility.run', label: 'Запускать AI Visibility', description: 'Создавать внешние web-grounded измерения' },\n"
    if anchor not in r: raise SystemExit('frontend RBAC permission anchor missing')
    r = r.replace(anchor, addition, 1)
    r = r.replace("  'competitive.view',\n  'automations.view',", "  'competitive.view',\n  'ai_visibility.view',\n  'automations.view',", 1)
    r = r.replace("      'competitive.view', 'competitive.manage',\n", "      'competitive.view', 'competitive.manage',\n      'ai_visibility.view', 'ai_visibility.manage', 'ai_visibility.run',\n", 1)
    r = r.replace("'competitive.view', 'tasks.view'", "'competitive.view', 'ai_visibility.view', 'tasks.view'", 1)
    r = r.replace("  { prefix: '/competitive', permission: 'competitive.view' },\n", "  { prefix: '/competitive', permission: 'competitive.view' },\n  { prefix: '/ai-visibility', permission: 'ai_visibility.view' },\n", 1)
    rbac.write_text(r, encoding='utf-8')
    print('frontend RBAC integrated')

nav = ROOT / 'src/layouts/PortalLayout/navigation.js'
n = nav.read_text(encoding='utf-8')
item = "  { to: '/ai-visibility', label: 'AI Visibility', Icon: ReputationIcon, permission: 'ai_visibility.view' },\n"
if item not in n:
    anchor = "  { to: '/competitive', label: 'Конкуренты', Icon: ReputationIcon, permission: 'competitive.view' },\n"
    if anchor not in n: raise SystemExit('navigation competitor anchor missing')
    n = n.replace(anchor, anchor + item, 1)
    nav.write_text(n, encoding='utf-8')
    print('navigation integrated')
