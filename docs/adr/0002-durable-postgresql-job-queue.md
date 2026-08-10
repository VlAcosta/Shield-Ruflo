# ADR 0002 — Durable PostgreSQL job queue before Redis

Status: Accepted

Date: 2026-08-10

## Context

Business Shield needs background execution for provider review synchronization, report generation, notifications and later automation work. The current production footprint already includes Fastify, Prisma and PostgreSQL, while Redis is not yet an operational dependency.

The product requires retries, deduplication, visible failure state and a worker process separated from the HTTP API. Adding Redis/BullMQ immediately would add another production datastore, backup/monitoring surface and deployment dependency before provider traffic justifies it.

## Decision

Use a durable PostgreSQL-backed `jobs` table and a separate worker process for the current P9 foundation.

The queue provides:

- persisted job payloads and state;
- scheduled `runAt` execution;
- attempt counts and maximum attempts;
- exponential retry delay;
- dead/final failure state;
- organization-scoped dedupe keys;
- claim locks so multiple workers do not intentionally process the same queued row;
- diagnostic `lastError` state;
- worker separation from the Fastify HTTP process.

The API remains responsible for validating tenant/authorization boundaries before enqueueing tenant work. Worker handlers re-read persisted resources rather than trusting arbitrary client tenant identifiers.

## Consequences

### Positive

- no new infrastructure dependency for the current deployment;
- jobs participate in the same backup/restore strategy as product data;
- queue history is directly inspectable for support and audit;
- deployment is small: one additional worker service;
- later migration to Redis/BullMQ can happen behind the same enqueue/handler boundary.

### Tradeoffs

- PostgreSQL is not intended to be a high-throughput message broker;
- polling produces more database traffic than a push-oriented queue;
- advanced rate limiting and very high concurrency are easier with BullMQ/Redis;
- providers with large sync volume may justify moving the transport later.

## Upgrade trigger

Re-evaluate Redis/BullMQ when one or more of these becomes true:

- queue throughput or polling load materially affects PostgreSQL;
- provider-specific concurrency/rate-limit scheduling becomes complex;
- long-running jobs need advanced distributed orchestration;
- many worker replicas are required;
- operational measurements show the PostgreSQL queue is a bottleneck.

Until then, adding Redis only for architectural fashion is not justified.

## Security / tenant impact

`organizationId` is persisted on tenant jobs. Dedupe keys are scoped by organization. Provider credentials are never placed in job payloads; workers resolve encrypted credential records by integration account when a real provider adapter is implemented.
