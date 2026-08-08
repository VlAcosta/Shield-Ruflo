# Stage A25.2 — FAQ + Dashboard Dark Theme

## Landing FAQ

- FAQ redesigned as a dedicated product help panel instead of a flat accordion.
- Added categories, question numbering, active-category context and a compact FAQ status header.
- Expanded the public FAQ to seven product-relevant questions.
- Accordion uses semantic button/region relations with `aria-expanded`, `aria-controls` and `aria-labelledby`.
- Answer animation uses CSS grid rows rather than fixed `max-height`, so longer answers are not clipped.
- Added staggered reveal and ambient motion; both are disabled by `prefers-reduced-motion`.
- Improved mobile layout and CTA presentation.

## Dashboard dark theme

- Added a dashboard-only dark theme; other portal pages keep their current appearance.
- Theme persists per account via scoped storage.
- Theme switch is available from the Dashboard workspace toolbar.
- The dark appearance includes Dashboard canvas, portal sidebar/topbar, KPI cards, widget cards, edit controls, common widget states and Dashboard modals.
- No full-page blur/filter is used for the theme.
- Theme transitions use surface/background/border/color transitions only.
- `prefers-reduced-motion` disables appearance transitions.

## New files

- `features/dashboard/hooks/useDashboardTheme.js`
- `services/dashboard/dashboardThemeService.js`
- `styles/dashboardDark.scss`

## Validation

- JS/JSX transpile parse: 0 syntax errors.
- Relative import scan: 0 missing relative imports.
- SCSS/CSS brace scan: 0 balance errors.
- A full CRA production build is not claimed because the supplied archive does not contain the actual project dependency/build manifest used on the deployment host.
