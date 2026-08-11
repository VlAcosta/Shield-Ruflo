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
      "const ListingHealthPage = lazy(() => import('./pages/portal/ListingHealthPage'));\n",
      "const ListingHealthPage = lazy(() => import('./pages/portal/ListingHealthPage'));\nconst AskShieldPage = lazy(() => import('./pages/portal/AskShieldPage'));\n",
      'App import')
patch('src/App.jsx',
      "'/ai-visibility','/location-health','/automations'",
      "'/ai-visibility','/location-health','/ask-shield','/automations'",
      'protected route')
patch('src/App.jsx',
      '        <Route path="/location-health" element={<LazyRoute><ListingHealthPage /></LazyRoute>} />\n',
      '        <Route path="/location-health" element={<LazyRoute><ListingHealthPage /></LazyRoute>} />\n        <Route path="/ask-shield" element={<LazyRoute><AskShieldPage /></LazyRoute>} />\n',
      'route registration')
patch('src/services/access/rbacService.js',
      "  { prefix: '/location-health', permission: 'locations.view' },\n",
      "  { prefix: '/location-health', permission: 'locations.view' },\n  { prefix: '/ask-shield', permission: 'analytics.view' },\n",
      'route permission')
patch('src/layouts/PortalLayout/navigation.js',
      "  { to: '/location-health', label: 'Локации', Icon: ReputationIcon, permission: 'locations.view' },\n",
      "  { to: '/location-health', label: 'Локации', Icon: ReputationIcon, permission: 'locations.view' },\n  { to: '/ask-shield', label: 'Ask Shield', Icon: ReputationIcon, permission: 'analytics.view' },\n",
      'navigation item')
