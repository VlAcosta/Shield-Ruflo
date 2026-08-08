# Admin Stage A5 — Support Operations

Implemented a premium helpdesk workspace based on the admin PDF ticket flows while keeping the newer Admin design language.

## Included

- `/admin/tickets` route and enabled sidebar item;
- support KPI row: open, in progress, high priority, closed this month;
- live queue with search, status and priority filters;
- URL-addressable selected ticket: `/admin/tickets?ticket=1001`;
- ticket detail header with status/priority/client context;
- manager assignment and status changes;
- conversation thread with reply composer;
- private/internal notes mode;
- close / reopen actions;
- SLA indicator and ticket inspector;
- ticket activity timeline;
- unread state cleared on open;
- dashboard ticket cards now open the helpdesk;
- client ticket cards now open the same ticket thread;
- localStorage fallback + API service abstraction;
- lightweight animations using transforms/opacity/SVG/progress width, without persistent blur;
- responsive layouts and `prefers-reduced-motion` handling.

## Performance notes

- search query uses `useDeferredValue`;
- ticket rows are memoized;
- the entire page is route-lazy-loaded;
- queue rendering is kept compact;
- no chart/runtime UI dependencies added;
- no permanent backdrop-filter on the workspace.
