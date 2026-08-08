# API notes — connected onboarding

Frontend не требует backend для локальной демонстрации, но готов к серверной синхронизации.

## Организация

Поиск организации остаётся:

`POST {REACT_APP_API_BASE}/company/lookup`

Профиль компании при наличии `REACT_APP_PROFILE_ENDPOINT` синхронизируется:

`PATCH {REACT_APP_PROFILE_ENDPOINT}/company`

Ожидается либо company snapshot, либо полный profile snapshot.

## Интеграции

На этом этапе интеграции сохраняются локально. Рекомендуемый будущий контракт:

- `GET /integrations`
- `PUT /integrations`
- `PATCH /integrations/:id`

UI уже использует нормализованную модель:

```json
{
  "id": "yandex",
  "name": "Яндекс.Бизнес",
  "category": "Отзывы",
  "tone": "amber",
  "link": "https://yandex.ru/maps/org/...",
  "enabled": true,
  "connectedAt": "2026-08-08T12:00:00.000Z"
}
```

## Политика безопасности

Рекомендуемый будущий контракт:

- `GET /profile/security/preferences`
- `PATCH /profile/security/preferences`

Payload:

```json
{
  "autoLock": true,
  "sessionMinutes": 15
}
```

Frontend применяет эти параметры локально к `PortalLayout` уже сейчас.
