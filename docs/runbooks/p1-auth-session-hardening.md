# P1 auth and session production configuration

Business Shield uses PostgreSQL-backed OTP challenges and opaque browser sessions. Raw OTP and session credentials are never stored in the database.

Required production settings:

- `AUTH_SECRET`: unique secret of at least 32 characters.
- `AUTH_COOKIE_SECURE=true`.
- `AUTH_COOKIE_SAME_SITE=lax` or `strict`; cross-site session cookies are intentionally unsupported until dedicated CSRF protection exists.
- `AUTH_OTP_PROVIDER=webhook` with an HTTPS `AUTH_OTP_WEBHOOK_URL` and provider token.
- `AUTH_OTP_FIXED_CODE` must be empty and `AUTH_EXPOSE_DEBUG_CODE=false`.
- `TRUST_PROXY`: keep empty/false when Fastify is directly reachable. Behind a trusted edge, set it to the exact proxy IP, CIDR, comma-separated allow-list, or `loopback`. Never trust all forwarding headers. The edge must overwrite inbound forwarded headers.

Before release, apply migrations with `prisma migrate deploy` and run the P1 integration suite against a disposable migrated PostgreSQL database using matching `DATABASE_URL` and `TEST_DATABASE_URL` values whose database name contains `test`, `p0`, `p1`, or `e2e`.

Rollback for the P1 database migration is limited to dropping `verification_codes_request_ip_created_idx`; application rollback does not require removing the index.
