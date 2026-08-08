# API contract — Team Security

Set:

```env
REACT_APP_TEAM_SECURITY_ENDPOINT=https://api.example.com/company-security
```

The frontend already falls back to local demo state if the endpoint is empty.


## Read team security state

`GET /`

Recommended response:

```json
{
  "members": [
    {
      "id": "user-1",
      "email": "user@company.ru",
      "status": "active",
      "accessExpiresAt": null,
      "forcedLogoutAt": null,
      "sessionRevision": 1,
      "sessions": []
    }
  ]
}
```

The portal polls this endpoint every 30 seconds when configured, so remote freezes and forced logouts can propagate to already-open browser sessions.

## Update member security

`PATCH /members/:memberId/security`

```json
{
  "status": "active",
  "accessExpiresAt": "2026-09-30T23:59:59.000Z",
  "frozenReason": ""
}
```

Response can be either the security object directly or:

```json
{
  "security": {
    "status": "active",
    "accessExpiresAt": "2026-09-30T23:59:59.000Z",
    "frozenAt": null,
    "frozenReason": "",
    "forcedLogoutAt": null,
    "sessionRevision": 2,
    "sessions": []
  }
}
```

## Force logout from all devices

`DELETE /members/:memberId/sessions`

Recommended response:

```json
{
  "forcedLogoutAt": "2026-08-08T15:00:00.000Z"
}
```

The backend must invalidate refresh/access sessions server-side. Frontend state alone is not a security boundary.

## Revoke one session

`DELETE /members/:memberId/sessions/:sessionId`

Return `204` or a JSON success body.

## Recommended session object

```json
{
  "id": "session-id",
  "deviceType": "desktop",
  "browser": "Chrome",
  "os": "Windows",
  "ip": "203.0.113.10",
  "location": "Москва, Россия",
  "createdAt": "2026-08-08T12:00:00.000Z",
  "lastSeenAt": "2026-08-08T14:59:00.000Z",
  "revokedAt": null
}
```

IP address and geolocation should come from the server. The browser demo intentionally does not invent these values.

## Current-member enforcement

For production, the authenticated session/membership response should include:

```json
{
  "securityStatus": "active",
  "accessExpiresAt": null,
  "sessionRevision": 2,
  "sessionEstablishedAt": "2026-08-08T15:05:00.000Z"
}
```

The backend should reject API requests when the member is frozen, expired, or the server-side session has been revoked. The frontend gate is a UX layer and must not replace server authorization.
