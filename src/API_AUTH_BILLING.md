# API: Auth + Billing (Stage A10)

Frontend is production-shaped and uses `REACT_APP_API_BASE` (default `http://localhost:8080`).

## Authentication

### POST `/auth/request-code`
Request:
```json
{
  "phone": "+79991234567",
  "mode": "login|register",
  "tariff": "pro"
}
```
Response:
```json
{
  "session_id": "..."
}
```

### POST `/auth/verify-code`
Request:
```json
{
  "phone": "+79991234567",
  "code": "1234",
  "session_id": "...",
  "mode": "login|register"
}
```
Response for existing user:
```json
{
  "token": "...",
  "user": {}
}
```
Optional response when login phone does not exist:
```json
{
  "needs_registration": true
}
```

### POST `/auth/complete-profile`
Authorization: `Bearer <token>` when available.

Request:
```json
{
  "phone": "+79991234567",
  "first_name": "Алексей",
  "last_name": "Иванов",
  "email": "user@company.ru",
  "tariff": "pro"
}
```

## Billing

### POST `/billing/promo/validate`
Request:
```json
{ "code": "SHIELD10" }
```
Response:
```json
{
  "valid": true,
  "discount": 0.1,
  "message": "Промокод применён: −10%"
}
```

### POST `/billing/checkout`
Authorization: `Bearer <token>`.

Request:
```json
{
  "planId": "pro",
  "billing": "monthly|annual",
  "promo": "SHIELD10",
  "amount": 8500,
  "currency": "RUB",
  "returnUrl": "https://bis-shield.ru/pricing?checkout=pro"
}
```

Response should contain a provider URL:
```json
{
  "id": "checkout_123",
  "checkout_url": "https://payment-provider/..."
}
```

## Local fallback

When the API is unreachable, the frontend enables a clearly labelled demo mode:
- OTP code: `1111`;
- users are stored in `business-shield:auth-users:v1`;
- promo code `SHIELD10` gives 10% in demo mode;
- checkout is stored as `business-shield:pending-checkout` and no real money is charged.
