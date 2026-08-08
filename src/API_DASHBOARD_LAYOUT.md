# Dashboard layout API contract

The dashboard works without a backend by persisting the normalized user layout in `localStorage`.
To enable server persistence, set:

`REACT_APP_DASHBOARD_LAYOUT_ENDPOINT=https://api.example.com/v1/me/dashboard-layout`

Expected contract:

## GET
Returns either the layout directly or `{ "layout": ... }`.

## PUT
Body:

```json
{
  "layout": {
    "version": 5,
    "preferences": {
      "density": "comfortable"
    },
    "order": ["reviews", "tasks", "checklist"],
    "widgets": {
      "reviews": { "visible": true, "span": 7 },
      "tasks": { "visible": true, "span": 5 },
      "checklist": { "visible": true, "span": 8 }
    }
  }
}
```

`preferences.density` supports:

- `comfortable`
- `compact`

Unknown widgets, invalid spans and invalid preference values are normalized on the client before rendering or persisting.

## DELETE
Resets the user layout and dashboard preferences to the product defaults.

Requests use `credentials: include` so the endpoint can be protected by the existing authenticated session.
