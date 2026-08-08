# API contract — RBAC / Team Access

Stage A17 имеет рабочий localStorage fallback. Ниже — рекомендуемый production-контракт для переноса состояния на backend.

## Roles

### GET `/company/access/roles`
Возвращает системные и пользовательские роли организации.

### POST `/company/access/roles`
```json
{
  "name": "Редактор отзывов",
  "description": "Работает с отзывами и задачами",
  "permissions": ["dashboard.view", "reviews.view", "reviews.reply", "tasks.view"]
}
```

### PATCH `/company/access/roles/:roleId`
Изменяет название, описание и permissions пользовательской роли.

### DELETE `/company/access/roles/:roleId`
Удаляет только пользовательскую роль. Backend должен запрещать удаление роли, пока она назначена участникам.

## Member access

### PATCH `/company/users/:userId/access`
```json
{
  "role_id": "moderator",
  "permission_overrides": {
    "allow": ["reports.export"],
    "deny": ["reviews.moderate"]
  }
}
```

Backend вычисляет effective permissions и возвращает обновлённого участника.

## Invitations

Создание приглашения должно принимать:
```json
{
  "name": "Анна Петрова",
  "email": "anna@company.ru",
  "role_id": "custom-editor",
  "permission_overrides": { "allow": [], "deny": [] }
}
```

После принятия invitation membership создаётся для существующей организации. Повторный organization onboarding участнику не нужен.

## Audit

### GET `/company/activity?cursor=...`
Возвращает audit events организации.

Рекомендуемая модель события:
```json
{
  "id": "evt_123",
  "type": "task_updated",
  "title": "Обновил задачу «Ответить на отзывы»",
  "detail": "Статус: В работе",
  "actor": { "id": "usr_1", "name": "Анна Петрова", "email": "anna@company.ru" },
  "created_at": "2026-08-08T14:20:00Z"
}
```

## Presence

Для production рекомендуется heartbeat раз в 30–60 секунд либо WebSocket/SSE.

### POST `/company/presence/heartbeat`
Backend сохраняет `last_seen_at`, а online считается по короткому TTL.

## Security

Frontend RBAC нужен для UX, но не является защитой данных. Каждый mutation/read endpoint на backend должен проверять membership организации и соответствующее permission независимо от состояния frontend.
