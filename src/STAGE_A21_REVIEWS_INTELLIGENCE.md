# Stage A21 — Reviews Intelligence

## Product decisions

Primary platforms for the first version:

- Яндекс
- 2GIS
- Ozon
- Отзовик
- Wildberries (WB)

Sentiment mapping:

- 1–3 stars — negative
- 4 stars — neutral
- 5 stars — positive

SLA policy:

- 1–2 stars — 6 hours
- 3 stars — 16 hours
- 4–5 stars — 24 hours

The organization director/administrator can select one of three response workflows:

1. Client responds independently.
2. Business Shield handles the response.
3. Draft → manager/director approval → publication.

## Implemented

- New full `/reviews` Reputation Operations Center.
- Five primary platform filters.
- SLA timer and risk/overdue states.
- AI/local copilot draft generation abstraction.
- AI reason classification for recurring reputation issues.
- Tone of voice policy with four presets plus a custom brand instruction.
- Three response modes controlled at organization level.
- Approval workflow with approve / return for changes / publish.
- Legal escalation workflow for disputed reviews.
- Automatic negative-review → task automation for 1–3 star reviews.
- Review/task relation via `sourceReviewId` and `taskId`.
- Per-review workflow history.
- Quick Reviews drawer now links to the full Reviews Intelligence center.
- New sidebar and command-search entry for Reviews.
- Expanded RBAC for review approval, legal escalation, and review policy settings.
- Provider registry that intentionally leaves transport capabilities unresolved until real integration methods are selected.
- Loading, error, filtered-empty, and role-limited states.
- Responsive three-column desktop workspace with two-/one-column fallbacks.
- GPU-friendly motion using opacity/transform/SVG strokes and `prefers-reduced-motion` support.

## RBAC additions

- `reviews.approve`
- `reviews.legal`
- `reviews.settings`

Preset behavior:

- Owner: full access.
- Admin: full review access.
- Moderator: view/reply/moderate/legal, but no organization policy or approval authority.
- Guest: read-only.

## Performance notes

Review mutation events now include the updated local snapshot. Mounted review UIs consume that snapshot directly rather than triggering a fresh GET for every local mutation. This avoids the event → GET → cache → event pattern that can create unnecessary traffic and UI stutter.

Automatic task creation is sequential, not parallel, to avoid local task-snapshot write races while the backend is not yet the source of truth.

## Deliberately not implemented

Bulk operations were intentionally not added in this stage.

Concrete external-platform API assumptions were intentionally not hard-coded. Integration transport is still unknown, so provider adapters remain capability-neutral until a real API/parsing strategy is selected.
