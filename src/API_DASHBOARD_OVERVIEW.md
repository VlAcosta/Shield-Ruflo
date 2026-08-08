# Dashboard Overview API

## Endpoint

```env
REACT_APP_DASHBOARD_OVERVIEW_ENDPOINT=https://api.example.com/v1/dashboard/overview
```

```http
GET /v1/dashboard/overview
Cookie: session=...
```

Ответ может быть напрямую overview object или:

```json
{
  "data": { "...": "overview" }
}
```

Также поддерживается поле `overview` вместо `data`.

## Рекомендуемый контракт

```json
{
  "generatedAt": "2026-08-08T15:00:00.000Z",
  "metrics": {
    "tasks": {
      "value": 18,
      "trend": { "value": 12, "tone": "positive" },
      "caption": "3 требуют внимания",
      "spark": [8, 9, 11, 11, 14, 16, 18]
    },
    "rating": {
      "value": 4.82,
      "trend": { "value": 1.7, "tone": "positive" },
      "caption": "284 оценки",
      "spark": [91, 92, 92, 94, 95, 96, 96]
    },
    "reviews": {
      "value": 284,
      "byPeriod": {
        "day": 4,
        "week": 21,
        "month": 76,
        "year": 284,
        "all": 284
      },
      "caption": "247 обработано",
      "spark": [2, 5, 8, 12, 15, 18, 21]
    },
    "shield": {
      "active": true,
      "caption": "3 источника подключено",
      "spark": []
    },
    "support": {
      "channelsOnline": 2,
      "responseMinutes": 8,
      "spark": []
    },
    "subscription": {
      "activeUntil": "2026-09-17T00:00:00.000Z",
      "planName": "Профессионал",
      "status": "active",
      "connectedCount": 3,
      "spark": []
    }
  },
  "pulse": {
    "measured": true,
    "score": 91,
    "status": "Стабильный рост",
    "spark": [86, 87, 89, 90, 90, 91, 91],
    "signals": [
      { "id": "negative", "label": "Негатив", "value": "8%", "caption": "доля низких оценок", "tone": "green" },
      { "id": "answers", "label": "Ответы", "value": "93%", "caption": "охват отзывов", "tone": "violet" },
      { "id": "platforms", "label": "Площадки", "value": "3", "caption": "подключено", "tone": "cyan" }
    ]
  },
  "reviews": {
    "week": {
      "labels": ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"],
      "received": [2, 3, 1, 5, 4, 3, 3],
      "answered": [2, 2, 1, 4, 4, 3, 2],
      "total": 21,
      "growth": 16.7
    },
    "month": {
      "labels": ["1 НЕД", "2 НЕД", "3 НЕД", "4 НЕД"],
      "received": [16, 20, 18, 22],
      "answered": [14, 18, 17, 20],
      "total": 76,
      "growth": 12.5
    }
  },
  "tasks": {
    "week": [
      { "id": "reviews", "label": "Отзывы", "total": 8, "completed": 6, "overdue": 1, "tone": "violet" }
    ],
    "month": [],
    "quarter": []
  },
  "rating": {
    "week": {
      "labels": ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"],
      "values": [4.71, 4.73, 4.75, 4.76, 4.79, 4.81, 4.82],
      "current": 4.82,
      "growth": 2.34,
      "reviews": 21,
      "positive": 91,
      "answered": 93
    },
    "month": {}
  },
  "processes": [],
  "reports": {
    "month": [],
    "quarter": []
  },
  "competitors": {
    "week": [],
    "month": [],
    "insight": ""
  },
  "team": [],
  "security": {
    "score": 90,
    "hasPin": true,
    "autoLock": true,
    "sessionMinutes": 15,
    "activeSessions": 2,
    "status": "Аккаунт защищён"
  },
  "integrations": []
}
```

## Semantics

- Все данные должны быть ограничены текущей organization/company membership.
- Периоды должны считаться backend относительно timezone организации/пользователя.
- `generatedAt` — время формирования snapshot.
- `pulse.score` должен вычисляться backend, если продуктовая формула становится официальной KPI.
- Если метрики ещё нет, лучше вернуть `null`/empty array, а не выдуманное значение.

## Cache / freshness

Frontend:

- cache TTL: 2 минуты;
- live revalidation: 60 секунд при активной вкладке;
- при API error показывает предыдущий cache как stale;
- при offline сохраняет последний snapshot.

Backend может использовать `ETag`/`If-None-Match` позднее; текущий frontend контракт этого не требует.

## Error contract

Рекомендуется:

```json
{
  "code": "DASHBOARD_UNAVAILABLE",
  "message": "Не удалось сформировать сводку"
}
```

HTTP 401/403 не должны маскироваться как empty dashboard.
