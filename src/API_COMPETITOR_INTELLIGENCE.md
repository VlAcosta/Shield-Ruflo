# Competitor Intelligence API

The frontend does not assume a scraping/API implementation for public platforms. It only defines a neutral company-scoped competitor contract.

## GET /competitors

Response may be either an array or `{ "items": [...] }`.

```json
{
  "items": [
    {
      "id": "cmp_123",
      "name": "Competitor A",
      "platform": "yandex",
      "url": "https://...",
      "rating": 4.72,
      "reviews": 845,
      "negativeShare": 12,
      "responseCoverage": 91,
      "updatedAt": "2026-08-08T17:00:00.000Z",
      "source": "provider"
    }
  ]
}
```

Supported frontend platform ids for the initial reputation benchmark:

- `yandex`
- `2gis`
- `ozon`
- `otzovik`
- `wb`

## POST /competitors

Creates a competitor source. Use `Idempotency-Key`.

```json
{
  "name": "Competitor A",
  "platform": "yandex",
  "url": "https://..."
}
```

Metrics may be omitted if the backend/provider resolves them itself.

## DELETE /competitors/:id

Removes the competitor from the organization workspace.

## Future provider responsibilities

The backend/provider layer should eventually own:

- source validation;
- sync scheduling;
- rating/review counts;
- negative share and response coverage;
- snapshots by period;
- sync status/errors;
- compliance with each platform's access rules.

The frontend must not infer that a configured URL means live provider synchronization.
