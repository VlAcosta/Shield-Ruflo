# P0 Prisma migration baseline

The `20260809210000_foundation_baseline` migration is the first authoritative
Prisma migration for the existing Business Shield foundation. It is safe to
apply normally only to a new, empty PostgreSQL database.

## New database

1. Confirm the target schema contains no Business Shield tables.
2. Run `prisma migrate deploy` with the intended `DATABASE_URL`.
3. Run `prisma migrate status` and confirm all three migrations are applied.
4. Verify the application readiness endpoint before accepting traffic.

## Existing database created before Prisma history

Do not run `migrate deploy` until the schema has been compared with the
foundation migration and a backup has been verified.

1. Take and verify a recoverable database backup.
2. Compare enums, tables, columns, indexes, foreign keys, and defaults against
   `20260809210000_foundation_baseline/migration.sql`.
3. Stop if any drift exists. Reconcile it with a separately reviewed forward
   migration; do not edit the baseline or mark it applied.
4. Only when the objects match exactly, record the baseline with:
   `prisma migrate resolve --applied 20260809210000_foundation_baseline`.
5. Run `prisma migrate deploy`, then `prisma migrate status`.
6. Run the P0 authentication, tenant-isolation, and reviews smoke tests before
   restoring traffic.

Rollback is restore-from-backup for a failed existing-database rollout. Never
drop populated foundation or review tables as a rollback strategy.
