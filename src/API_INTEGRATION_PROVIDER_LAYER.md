# API — Integration Provider Layer

Frontend ожидает общий backend gateway:

```env
REACT_APP_INTEGRATIONS_ENDPOINT=https://api.example.ru/integrations
```

## Connect

`POST /providers/:providerId/connect`

```json
{
  "link": "https://...",
  "metadata": {}
}
```

Ответ может сразу подтвердить соединение:

```json
{
  "connection": {
    "id": "yandex",
    "status": "connected",
    "connectedAt": "2026-08-08T18:00:00.000Z"
  }
}
```

или запросить внешний OAuth/authorization flow:

```json
{
  "connection": {
    "id": "ozon",
    "status": "expired"
  },
  "requires_authorization": true,
  "authorization_url": "https://provider.example/oauth/..."
}
```

## Reconnect

`POST /providers/:providerId/reconnect`

Используется для истёкших токенов и degraded/error state. Может также вернуть `authorization_url`.

## Manual sync

`POST /providers/:providerId/sync`

Пример ответа:

```json
{
  "status": "connected",
  "syncedAt": "2026-08-08T18:10:00.000Z",
  "next_sync_at": "2026-08-08T18:25:00.000Z",
  "stats": {
    "reviews": 38,
    "updated": 7,
    "created": 3
  }
}
```

## Diagnostics

`GET /providers/:providerId/diagnostics`

```json
{
  "ok": true,
  "checkedAt": "2026-08-08T18:12:00.000Z",
  "checks": [
    { "id": "auth", "label": "Авторизация", "ok": true },
    { "id": "source", "label": "Источник доступен", "ok": true },
    { "id": "permissions", "label": "Права API", "ok": true }
  ]
}
```

## Disconnect

`POST /providers/:providerId/disconnect`

Отключение должно отзывать/удалять provider token на backend, если это позволяет конкретный adapter.

## Важные требования backend

- provider secrets и refresh tokens никогда не отправляются в frontend;
- все endpoints проверяют membership и `integrations.manage`;
- read endpoints проверяют `integrations.view`;
- connect/reconnect/disconnect/sync должны иметь audit trail;
- sync job должен быть идемпотентным;
- webhook payload должен проверять подпись провайдера;
- provider adapter нормализует внешние отзывы в единую review model;
- frontend `configured` не означает, что соединение с площадкой реально установлено;
- `connected` должен возвращаться только после подтверждения backend/provider;
- для long-running sync предпочтителен job id + polling/SSE/WebSocket status, а не долгий HTTP request.

## Provider adapters

Рекомендуемая backend-модель:

```text
Integration Gateway
       │
       ├── YandexAdapter
       ├── TwoGisAdapter
       ├── OzonAdapter
       ├── OtzovikAdapter
       └── WildberriesAdapter
              │
              ▼
     normalized reviews/events
```

Конкретные capabilities в frontend сейчас являются целевыми возможностями продукта, а не утверждением, что официальный API каждой площадки уже предоставляет каждый метод.
