# Admin Tickets API

The Admin Tickets UI is API-ready. Set:

```env
REACT_APP_ADMIN_TICKETS_ENDPOINT=https://api.example.com/admin/tickets
```

Expected endpoints:

- `GET /admin/tickets` → `{ tickets: Ticket[] }` or `Ticket[]`
- `PATCH /admin/tickets/:ticketId` → updated `Ticket`
- `POST /admin/tickets/:ticketId/messages` → created message

Recommended production additions:

- server-side search/filter/pagination for large queues;
- websocket/SSE updates for incoming client messages and status changes;
- file upload endpoint returning attachment references;
- immutable audit log for status/assignee/priority changes;
- SLA timestamps computed on the backend;
- RBAC: support agents can reply/reassign, superadmin can change global rules;
- connect the user-facing support chat to the same thread/ticket entity instead of duplicating conversations.

Without an endpoint the feature uses localStorage key `business-shield:admin-tickets:v1`.
