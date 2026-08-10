-- Support bounded OTP request counting by client IP and time window.
-- This is an additive, non-destructive index. Rollback is:
-- DROP INDEX "verification_codes_request_ip_created_idx";

CREATE INDEX "verification_codes_request_ip_created_idx"
ON "verification_codes"("request_ip", "created_at");
