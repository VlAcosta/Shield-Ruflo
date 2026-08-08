# Stage A14 — First-run Dashboard

## Goal
After onboarding, a new customer now lands on a dedicated launch experience instead of a dense dashboard filled with mature-account demo metrics.

## Behaviour
- The first-run experience is available for 14 days after onboarding completion unless the customer hides it earlier.
- Onboarding resets the first-run state so a freshly configured organization always receives the launch experience.
- Progress is derived from five real milestones:
  1. organization verified;
  2. at least one integration connected;
  3. PIN/security configured;
  4. at least one connected platform has a source URL;
  5. the customer opened the starter workspace.
- A source URL can be added directly from the dashboard.
- The starter workspace displays only Integrations, Security and Quick actions.
- After the launch experience is dismissed, the normal configurable dashboard is shown.

## Motion
The experience uses compositor-friendly motion wherever practical:
- opacity / transform entry sequences;
- rotating progress orbits;
- radar sweep;
- subtle status pulses;
- staggered checklist appearance;
- no permanent full-screen backdrop blur.

All decorative animation is disabled by `prefers-reduced-motion: reduce`.

## Storage
- `business-shield:dashboard:first-run:v1`
- reads `business-shield:onboarding:configuration:v1`
- reads existing integration and security preference caches.

## Main files
- `features/dashboard/FirstRunExperience/`
- `features/dashboard/hooks/useDashboardFirstRun.js`
- `services/dashboard/dashboardFirstRunService.js`
- `pages/DashboardPage.jsx`
