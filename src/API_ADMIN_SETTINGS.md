# Admin Settings API

Env: `REACT_APP_ADMIN_SETTINGS_ENDPOINT`

Ожидаемые маршруты:

- `GET /admin/settings`
- `PATCH /admin/settings/notifications`
- `PATCH /admin/settings/smtp`
- `POST /admin/settings/smtp/test`
- `POST /admin/settings/integrations/:id/toggle`
- `POST /admin/settings/templates`
- `PATCH /admin/settings/templates/:id`
- `DELETE /admin/settings/templates/:id`
- `PATCH /admin/settings/security`

Тарифы используют единый Billing service, чтобы настройки и раздел подписок не расходились.
