# Landing Stage A9 — Main page redesign

## Goal
Rebuild the public main page as a premium, responsive SaaS landing page while preserving the product structure and messaging from the supplied desktop/tablet/mobile references.

## What changed
- New feature-based landing implementation under `features/landing/`.
- Sticky/fixed premium header with anchors, mobile menu, login and pricing CTAs.
- New hero with product cockpit preview instead of a static logo-only composition.
- Problems, process, monitoring radar, capabilities, advantages, pricing, team, cases, industries, services, FAQ, final CTA and footer redesigned.
- Responsive layouts for desktop, tablet and phone.
- New motion system based mostly on `transform`, `opacity` and SVG stroke animation.
- `prefers-reduced-motion` support.
- Landing page is lazy-loaded from `App.js`.
- Legacy landing SCSS is no longer imported by the global stylesheet.
- Large legacy case SVG files (~31 MB combined) were removed and replaced by WebP assets (~98 KB combined).

## Navigation
- `/` — new landing page
- `/pricing` — pricing CTA
- `/auth` — login CTA

## Performance notes
The new landing only loads its feature SCSS and referenced assets. The old `str1`–`str10` styles are no longer imported into the global bundle. The two large legacy case-image SVG containers were removed.

## Validation
- TypeScript `transpileModule` syntax check over JS/JSX: 0 errors.
- Relative import check: 0 missing imports.
- Landing SCSS brace balance: OK.
