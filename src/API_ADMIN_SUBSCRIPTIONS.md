# Admin Subscriptions API

Env: `REACT_APP_ADMIN_SUBSCRIPTIONS_ENDPOINT`

Ожидаемые маршруты:

- `GET /admin/subscriptions`
- `PATCH /admin/subscriptions/subscriptions/:clientId`
- `PATCH /admin/subscriptions/plans/:planId`
- `POST /admin/subscriptions/plans`

До подключения API используются существующие admin clients + локальная конфигурация тарифов.
