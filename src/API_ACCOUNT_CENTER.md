# Account Center API contract

Frontend использует `REACT_APP_ACCOUNT_ENDPOINT` как базовый URL account API.

## Запрос изменения контакта

```http
POST {REACT_APP_ACCOUNT_ENDPOINT}/contacts/email/request
POST {REACT_APP_ACCOUNT_ENDPOINT}/contacts/phone/request
Content-Type: application/json

{
  "value": "new@company.ru"
}
```

Ожидаемый ответ:

```json
{
  "challengeId": "challenge_123",
  "expiresAt": "2026-08-08T18:30:00+03:00"
}
```

Backend должен:

- проверить активную пользовательскую сессию;
- применить rate limit;
- не раскрывать существование чужого аккаунта через тексты ошибок;
- отправить одноразовый код по выбранному каналу;
- ограничить срок и число попыток проверки.

## Подтверждение контакта

```http
POST {REACT_APP_ACCOUNT_ENDPOINT}/contacts/email/verify
POST {REACT_APP_ACCOUNT_ENDPOINT}/contacts/phone/verify
Content-Type: application/json

{
  "value": "new@company.ru",
  "code": "1234",
  "challengeId": "challenge_123"
}
```

После успешной проверки backend должен атомарно изменить контакт текущего пользователя и вернуть подтверждённое состояние.

Frontend после этого синхронизирует `/profile/personal`, чтобы локальная UI-модель оставалась совместимой с текущим profile service.

## Требования к безопасности

Frontend-подтверждение не является security boundary. Backend обязательно должен повторно проверять:

- identity текущего пользователя;
- принадлежность challenge этому пользователю;
- TTL challenge;
- одноразовость challenge;
- rate limit;
- уникальность нового email/телефона;
- необходимость step-up authentication для чувствительных изменений.

## Локальный fallback

Если `REACT_APP_ACCOUNT_ENDPOINT` отсутствует, интерфейс переходит в явно обозначенный demo-режим. Код: `1111`.
