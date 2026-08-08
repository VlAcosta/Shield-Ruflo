# Stage A25 — UX Polish, Calendar, Competitors, Integrations & Reports

Stage A25 closes the visual/UX issues identified from the current screenshots and finishes the four dashboard/product areas that still felt incomplete.

## Public landing

- Creative Lab CTA restored and made explicit: `Обсудить проект`.
- Problem cards rebuilt so copy no longer collides with lower captions.
- Large desktop landing icons use a unified 28px visual rhythm.
- Industries section receives corrected spacing, staggered reveal and animated ambient background.
- FAQ accordion rebuilt with accessible expand/collapse regions and a real support CTA.
- Footer now uses the shared `BrandMark`; typography and contrast were increased.

## Auth / onboarding / first run

- Auth/register layout now scrolls safely and has compact modes for short laptop screens.
- PIN confirmation turns into a success state, shows a notification and then proceeds automatically.
- Topbar Reviews control has a visible icon, clearer count and corrected alignment.
- Completed first-run success panel dismisses automatically after a short confirmation interval.

## Calendar

Calendar is now a planning center rather than a tiny month grid:

- wider default widget span;
- current month + selected-day agenda;
- event filters;
- work/report/meeting/deadline/SLA event types;
- current month and next-seven-days counters;
- upcoming events navigation;
- event deletion;
- portal-based composer, so forms are never clipped by the dashboard card;
- optional notes and improved responsive behavior.

The existing `CALENDAR_ENDPOINT` contract remains valid. Local scoped cache is still a fallback when no endpoint exists.

## Competitor Intelligence

The dashboard competitor card now has a real workflow:

- add 3–5 competitors;
- choose Yandex / 2GIS / Ozon / Otzovik / Wildberries;
- save a link and temporary manual baseline metrics;
- compare own rating with the selected market benchmark;
- see strongest competitor and average negative-share signal;
- remove competitors from the configuration dialog.

Until a provider is chosen, manually entered metrics are clearly treated as a baseline rather than pretending to be live data.

Production endpoint:

```env
REACT_APP_COMPETITORS_ENDPOINT=https://api.example.com/competitors
```

Recommended contract:

- `GET /competitors`
- `POST /competitors`
- `DELETE /competitors/:id`

## Integration Hub

The previous plain list was replaced by a connection-health widget and management dialog.

- Shows configured vs incomplete sources.
- Allows enabling/disabling integrations and editing source links.
- Provider status is described honestly: connection configuration can be ready even while real provider synchronization is not implemented.
- The review-source catalog now includes the current priority platforms: Yandex, 2GIS, Ozon, Otzovik and Wildberries. Google remains available but is no longer a recommended default source.

## Reports

Reports now open with a Report Command Center:

- ready/processing overview;
- active auto-delivery count;
- latest ready report;
- common report type;
- direct actions to Builder and Schedule;
- improved navigation context.

Existing list, builder, detail and schedule functionality remains intact. Heavy `backdrop-filter` was removed from the workspace navigation/toast.

## Performance rules kept

- No always-on full-screen blur was added.
- New motion primarily uses transform, opacity and light CSS/SVG progress effects.
- `prefers-reduced-motion` is respected in the new calendar, competitor, integration and reports surfaces.
- Local modal dialogs render through portals when card overflow could clip them.
