# API — Team Invitations & Product Feedback

## Приглашения пользователей

Frontend использует `REACT_APP_COMPANY_INVITATIONS_ENDPOINT` как базовый endpoint сервиса приглашений.

### POST `{INVITATIONS_ENDPOINT}`
Создать приглашение.

Request:
```json
{
  "name": "Анна Петрова",
  "email": "anna@company.ru",
  "role": "moderator",
  "company": {
    "title": "ООО ВНАЛ",
    "inn": "7701234567"
  }
}
```

Expected response:
```json
{
  "invitation": {
    "token": "secure-token",
    "name": "Анна Петрова",
    "email": "anna@company.ru",
    "role": "moderator",
    "status": "pending",
    "company": { "title": "ООО ВНАЛ", "inn": "7701234567" },
    "expires_at": "2026-08-15T12:00:00.000Z",
    "invite_url": "https://app.example.ru/auth?invite=secure-token"
  }
}
```

### GET `{INVITATIONS_ENDPOINT}/{token}`
Проверить приглашение перед показом auth flow.

### POST `{INVITATIONS_ENDPOINT}/{token}/accept`
Принять приглашение после подтверждения телефона/создания профиля.

Request:
```json
{
  "user": {
    "id": "user-123",
    "phone": "+79991234567",
    "firstName": "Анна",
    "lastName": "Петрова",
    "email": "anna@company.ru"
  }
}
```

Expected response:
```json
{
  "membership": {
    "id": "membership-123",
    "role": "moderator",
    "company": { "title": "ООО ВНАЛ", "inn": "7701234567" },
    "joinedAt": "2026-08-08T12:00:00.000Z"
  }
}
```

`/auth/request-code`, `/auth/verify-code` и `/auth/complete-profile` дополнительно принимают `invitation_token`.

Без endpoint frontend работает в demo/localStorage режиме. Такая ссылка предназначена только для локальной проверки в том же origin; реальная межустройственная отправка требует backend.

## Предложения по продукту

Вариант 1 — рекомендуемый:

`REACT_APP_SUGGESTIONS_ENDPOINT=https://api.example.ru/product-feedback`

Frontend отправляет POST JSON:
```json
{
  "category": "Новая функция",
  "subject": "Уведомления о падении рейтинга",
  "message": "...",
  "name": "Алексей",
  "email": "client@example.ru",
  "route": "/dashboard",
  "destination": "product@example.ru"
}
```

Адрес назначения можно передать через `REACT_APP_SUGGESTIONS_EMAIL`.

Вариант 2 — без backend:

`REACT_APP_SUGGESTIONS_EMAIL=product@example.ru`

Frontend сохраняет заявку в локальную очередь и открывает подготовленное письмо через `mailto:`. Для автоматической отправки письма без почтового клиента необходим backend/SMTP endpoint.
