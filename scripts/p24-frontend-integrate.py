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
      "const AiVisibilityPage = lazy(() => import('./pages/portal/AiVisibilityPage'));\n",
      "const AiVisibilityPage = lazy(() => import('./pages/portal/AiVisibilityPage'));\nconst ListingHealthPage = lazy(() => import('./pages/portal/ListingHealthPage'));\n",
      'App import')
patch('src/App.jsx',
      "'/competitive','/ai-visibility','/automations'",
      "'/competitive','/ai-visibility','/location-health','/automations'",
      'protected route')
patch('src/App.jsx',
      '        <Route path="/ai-visibility" element={<LazyRoute><AiVisibilityPage /></LazyRoute>} />\n',
      '        <Route path="/ai-visibility" element={<LazyRoute><AiVisibilityPage /></LazyRoute>} />\n        <Route path="/location-health" element={<LazyRoute><ListingHealthPage /></LazyRoute>} />\n',
      'route registration')
patch('src/services/access/rbacService.js',
      "  { prefix: '/ai-visibility', permission: 'ai_visibility.view' },\n",
      "  { prefix: '/ai-visibility', permission: 'ai_visibility.view' },\n  { prefix: '/location-health', permission: 'locations.view' },\n",
      'route permission')
patch('src/layouts/PortalLayout/navigation.js',
      "  { to: '/ai-visibility', label: 'AI Visibility', Icon: ReputationIcon, permission: 'ai_visibility.view' },\n",
      "  { to: '/ai-visibility', label: 'AI Visibility', Icon: ReputationIcon, permission: 'ai_visibility.view' },\n  { to: '/location-health', label: 'Локации', Icon: ReputationIcon, permission: 'locations.view' },\n",
      'navigation item')
