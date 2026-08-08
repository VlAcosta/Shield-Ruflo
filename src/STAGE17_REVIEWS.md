# Stage 17 — Reviews center

## Fixed

The Reviews drawer depended on styles from the old global `portal.scss`. Once the legacy stylesheet was removed or deferred for performance, the drawer could open almost unstyled.

The drawer is now self-contained:
- `PortalReviewsDrawer.jsx`
- `PortalReviewsDrawer.scss`

It no longer depends on the legacy global portal stylesheet.

## Performance

- Reviews drawer is loaded with `React.lazy` only when required.
- Hover/focus on the header Reviews button preloads the drawer chunk.
- Immediate lightweight fallback is rendered while the chunk loads.
- No `backdrop-filter` on the reviews overlay.
- Review cards use `content-visibility: auto`.
- Only 10 matching reviews are rendered initially; more are appended on demand.
- Search uses `useDeferredValue`.
- Review cards are memoized.
- Body scrolling is locked only while the drawer is open.

## UX

- Three queues: Requires reply, Deferred, Processed.
- Live pending count in the header instead of hardcoded `99+`.
- Search by author, text, source or tag.
- Platform and rating filters.
- KPI row: pending, negative, average rating.
- Split list/detail workspace on desktop.
- Mobile list/detail navigation.
- Reply composer with quick templates.
- Defer, mark processed and return to work actions.
- API-ready persistence with localStorage fallback.
- Loading, error and empty states.
