# Dashboard first-run integration notes

The first-run UI currently derives state from the configuration produced by onboarding and the shared profile/integration/security caches.

For a backend implementation, the recommended account bootstrap response is:

```json
{
  "organization": { "verified": true },
  "integrations": [
    { "id": "yandex", "enabled": true, "link": "https://..." }
  ],
  "security": { "pinConfigured": true, "autoLock": true, "sessionMinutes": 15 },
  "firstRun": { "workspaceOpened": false, "dismissed": false }
}
```

Recommended endpoints:
- `GET /me/bootstrap`
- `PATCH /me/first-run`
- `PATCH /me/integrations/:id`

The frontend localStorage implementation is a fallback and can be replaced by these endpoints without changing the view components.
