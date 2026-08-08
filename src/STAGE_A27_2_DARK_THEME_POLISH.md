# Stage A27.2 — Dark Theme Polish

## Scope

- Removed the floating `?` help control from `PortalLayout` globally.
- Reworked dark-theme contrast across Dashboard, Reviews Intelligence, Integrations, Subscriptions, Reports, Tasks, Account/Company/Team, Support Chat and Portal FAQ.
- Added dark styling for shared `PeriodMenu` and `Badge` components.
- Kept exported report paper preview intentionally light while the report builder shell is dark.
- No new heavy persistent blur effects were added.

## Main visual fixes

- Removed white/gray islands inside dark Dashboard widgets.
- Corrected rating/process/checklist/task surfaces and period controls.
- Corrected Reviews Intelligence inspector, AI Copilot, SLA/reason/action sidecards and workflow timeline.
- Converted subscription package cards, cart, promo controls and payment history to native dark surfaces.
- Converted Report Command Center metrics, report list and builder controls to dark surfaces.
- Converted Kanban task cards and task details to dark surfaces.
- Converted account contacts, company profile fields and team security/device cards to dark surfaces.
- Corrected support chat bubbles/composer/attachments and FAQ categories/questions/answers.

## Verification

- JS/JSX transpile: 372 files, 0 syntax errors.
- Relative imports: 799, 0 missing.
- SCSS/CSS: 118 files, 0 brace mismatches.
