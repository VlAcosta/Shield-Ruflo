# ADR 0003 — External provider integration boundary

Status: Accepted

Date: 2026-08-10

## Context

Business Shield presents integration surfaces for review providers and communication systems. The application must never claim `Connected`, `Synced`, `Published` or similar external success without a provider-confirmed operation.

Credentials are security-sensitive and cannot live in frontend state, localStorage or logs.

## Decision

The backend owns the complete provider lifecycle through durable `IntegrationAccount`, `IntegrationCredential`, `IntegrationSyncRun` and `IntegrationEvent` records.

Provider-facing code must implement a bounded adapter interface conceptually equivalent to:

- connect;
- disconnect;
- validate connection;
- synchronize reviews;
- publish reply;
- report status.

Until a production adapter and credentials exist, the backend returns a truthful `PROVIDER_ADAPTER_NOT_CONFIGURED`/unavailable result. It must not transition an account to `CONNECTED` simply because a UI form was submitted.

Credential values are encrypted at rest using a server-only encryption key. API responses expose only credential key names/metadata, never encrypted or plaintext values.

## Consequences

- frontend provider cards become views/controllers over backend state;
- provider-specific details remain isolated from the rest of the product;
- review import continues to use source/external-id idempotency;
- reply publication is not marked `PUBLISHED` until a real provider adapter confirms publication;
- future provider support can be added without changing core Review/Task domains.

## Security

- no provider credential is returned to the browser;
- server logs redact credential-like fields;
- production requires a unique integration credential encryption key;
- all account lookup and sync operations are organization-scoped;
- job payloads contain IDs only, never secrets.
