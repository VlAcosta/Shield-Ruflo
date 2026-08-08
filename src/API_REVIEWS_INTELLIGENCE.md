# API — Reviews Intelligence

The frontend currently works with local scoped cache fallbacks, but the intended server contracts are below.

## Environment variables

```env
REACT_APP_REVIEWS_ENDPOINT=
REACT_APP_REVIEWS_INTELLIGENCE_ENDPOINT=
REACT_APP_REVIEWS_AI_ENDPOINT=
REACT_APP_REVIEW_PROVIDERS_ENDPOINT=
REACT_APP_TASKS_ENDPOINT=
```

## Core reviews

### GET `/reviews`

Returns either an array or:

```json
{
  "items": []
}
```

Recommended review shape:

```json
{
  "id": "rv-001",
  "externalId": "provider-review-id",
  "platform": "Яндекс",
  "author": "Иван Петров",
  "rating": 2,
  "createdAt": "2026-08-08T15:03:00.000Z",
  "text": "...",
  "status": "new",
  "workflowStatus": "inbox",
  "tags": ["персонал"],
  "aiReasons": ["персонал", "ожидание"],
  "reply": "",
  "assignee": "",
  "taskId": "",
  "approval": null,
  "legalCase": null
}
```

### PATCH `/reviews/:reviewId`

Updates review workflow state, draft, assignment, AI reasons, legal state, etc.

Backend must authorize every mutation by organization membership and RBAC permission.

## Organization review policy

### GET `/reviews-intelligence/settings`

Returns the organization-level response policy. The frontend uses a company-scoped cache only as a fallback.

### PATCH `/reviews-intelligence/settings`

Example body:

```json
{
  "responseMode": "approval",
  "tonePreset": "friendly",
  "toneInstruction": "Пишем спокойно и по-человечески...",
  "autoCreateNegativeTask": true,
  "aiReasonsEnabled": true,
  "legalEscalationEnabled": true,
  "slaHours": {
    "1": 6,
    "2": 6,
    "3": 16,
    "4": 24,
    "5": 24
  }
}
```

Only organization-level users with `reviews.settings` should be allowed to change this policy.

## AI copilot

### POST `/reviews-ai/draft`

```json
{
  "reviewId": "rv-001",
  "rating": 2,
  "text": "...",
  "platform": "Яндекс",
  "tone": "friendly",
  "instruction": "..."
}
```

Response:

```json
{
  "text": "Спасибо, что написали...",
  "reasons": ["персонал", "ожидание"]
}
```

AI output must always be treated as a draft, not as trusted factual data. Facts and commitments should be checked before publication.

## Provider publication adapter

The real integration method is not yet selected. The frontend therefore uses a transport-neutral publication endpoint.

### POST `/review-providers/reply`

```json
{
  "reviewId": "rv-001",
  "externalId": "provider-review-id",
  "platform": "Яндекс",
  "text": "Ответ компании"
}
```

The backend/provider layer decides whether the platform uses an official API, partner API, another approved integration path, or cannot publish automatically. If the configured provider endpoint rejects publication, the frontend keeps the review unpublished and shows an error rather than pretending that the reply was sent.

Do not expose platform credentials/tokens to the browser.

## Approval workflow

Recommended backend endpoints when server workflow is implemented:

```text
POST /reviews/:id/approval
POST /reviews/:id/approval/approve
POST /reviews/:id/approval/request-changes
```

The backend must record actor, timestamp, previous state, new state, and revision history.

## Legal escalation

Recommended endpoint:

```text
POST /reviews/:id/legal-cases
```

Example body:

```json
{
  "reason": "Возможное недостоверное утверждение",
  "evidence": []
}
```

Recommended lifecycle:

```text
precheck → evidence → platform_request → monitoring → resolved/rejected
```

No UI action should imply that a review is automatically removable.

## Negative-review automation

For 1–3 star reviews the current frontend can create a task automatically.

Recommended production approach: implement this server-side as an idempotent rule/event worker, e.g.:

```text
review.received
  → sentiment/rating policy
  → create task if no task exists for reviewId
```

Use a unique constraint/idempotency key around `organizationId + reviewId + automationRuleId`.

## SLA

SLA deadline should ultimately be calculated server-side from immutable review receipt time and organization policy. The frontend may display the countdown, but the backend must be the authoritative source for breaches and alert generation.
