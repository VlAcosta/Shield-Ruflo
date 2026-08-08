# Admin Clients API contract

Base endpoint: `REACT_APP_ADMIN_CLIENTS_ENDPOINT`

## GET /

Response:

```json
{
  "clients": [
    {
      "id": "vnal",
      "name": "ООО «ВНАЛ»",
      "inn": "7701234567",
      "email": "client@vnal.ru",
      "phone": "+7 (999) 123-45-67",
      "planId": "professional",
      "status": "active",
      "managerId": "alexey",
      "revenue": 4990,
      "rating": 4.99,
      "startDate": "17.08.2025",
      "expiryDate": "17.03.2026"
    }
  ]
}
```

## POST /

Creates a client. Returns the created client object.

## PATCH /:clientId

Partial client update. Returns the updated client object.
