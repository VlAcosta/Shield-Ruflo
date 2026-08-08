# Reputation Analytics API

Frontend env:

```env
REACT_APP_REPUTATION_ANALYTICS_ENDPOINT=https://api.example.com/v1/reputation/analytics
```

Запрос:

```http
GET {ENDPOINT}?days=30
```

Рекомендуемый ответ:

```json
{
  "generatedAt": "2026-08-08T17:00:00.000Z",
  "periodDays": 30,
  "health": 82,
  "current": {
    "count": 120,
    "rating": 4.63,
    "negativeShare": 14,
    "responseCoverage": 94,
    "avgResponseHours": 4.8,
    "slaBreaches": 2
  },
  "previous": {},
  "deltas": {},
  "trend": [],
  "platforms": [],
  "reasons": [],
  "insights": [],
  "recommendations": []
}
```

Backend должен считать агрегаты из server-side review history. Frontend fallback предназначен для разработки/offline, а не как production source of truth.
