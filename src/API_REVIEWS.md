# Reviews API contract

Set the endpoint in the frontend environment:

```env
REACT_APP_REVIEWS_ENDPOINT=https://api.example.com/v1/me/reviews
```

The reviews drawer works with localStorage when the endpoint is not configured.

## Endpoints

### GET `/reviews`
Returns either an array of reviews or `{ "items": [...] }`.

### PATCH `/reviews/:reviewId`
Updates review metadata/status.

Example body:

```json
{ "status": "deferred" }
```

Supported UI statuses:
- `new`
- `deferred`
- `done`

### POST `/reviews/:reviewId/reply`
Sends or updates the company reply.

```json
{ "text": "Спасибо за обратную связь..." }
```

## Performance notes

The UI deliberately renders reviews by pages instead of putting an unlimited list in the DOM. The drawer itself is code-split and loaded only when the user opens or preloads it by hovering/focusing the header button.

## Stage A21 extension

The full Reviews Intelligence workflow is documented in `API_REVIEWS_INTELLIGENCE.md`.

The first supported product surface prioritizes Яндекс, 2GIS, Ozon, Отзовик and Wildberries. Concrete provider transport remains unresolved until real integration methods are selected; do not assume that every platform supports automatic reply publication through an official API.
