# Automation API — рекомендуемый контракт

Для следующего backend этапа:

```env
REACT_APP_AUTOMATIONS_ENDPOINT=https://api.example.com/v1/automations
```

Рекомендуемые routes:

```http
GET    /automations
POST   /automations
PATCH  /automations/:id
DELETE /automations/:id
POST   /automations/:id/enable
POST   /automations/:id/disable
GET    /automations/runs?cursor=...
POST   /automations/evaluate        # internal/admin only
```

Server-side execution должен использовать event id / idempotency key, durable execution log и retry policy. Нельзя полагаться на браузерный execution ledger как на production-гарантию.
