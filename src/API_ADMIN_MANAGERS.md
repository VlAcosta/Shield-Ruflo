# Admin Managers API

Frontend поддерживает endpoint через:

```env
REACT_APP_ADMIN_MANAGERS_ENDPOINT=https://api.example.com/admin/managers
```

Если переменная отсутствует, используется localStorage fallback.

## GET /admin/managers

Ответ:

```json
{
  "managers": [
    {
      "id": "alexey",
      "initials": "АВ",
      "name": "Алексей Воронов",
      "shortName": "Алексей",
      "email": "a.voronov@biznesshield.ru",
      "phone": "+7 (999) 111-22-33",
      "role": "Персональный менеджер",
      "joinedAt": "01.03.2025",
      "status": "active",
      "statusLabel": "Активен",
      "rating": 4.8,
      "openTickets": 3,
      "capacity": 6,
      "responseTime": 18,
      "satisfaction": 96,
      "performance": [72, 76, 79, 81, 88, 91, 94]
    }
  ]
}
```

## POST /admin/managers

Создание менеджера. Body соответствует объекту менеджера без обязательного `id`.

## PATCH /admin/managers/:managerId

Частичное обновление профиля менеджера.

## Назначение клиентов

Портфель менеджера строится из Admin Clients API. Переназначение клиента выполняется текущим контрактом:

```text
PATCH /admin/clients/:clientId
```

Body:

```json
{
  "managerId": "alexey",
  "manager": "Алексей",
  "managerName": "Алексей Воронов",
  "managerInitials": "АВ"
}
```

В будущем рекомендуется заменить эту операцию на доменный endpoint наподобие `PATCH /admin/clients/:clientId/manager`, но текущая архитектура UI от этого не зависит.
