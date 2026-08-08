# Stage A10 — Brand, Pricing, Auth

## Brand mark
- New standalone `business-shield-mark.svg`.
- Consistent indigo → violet → magenta gradient.
- Shield + check mark communicates protection and resolved reputation tasks.
- Used for the public landing mark, pricing, auth, portal sidebar, admin sidebar/PIN and runtime favicon.
- CRA default `logo.svg` was replaced.

## Pricing
- Fully new visual design aligned with Stage A9 landing.
- Monthly/annual billing switch (15% annual discount).
- Transparent price math and checkout summary.
- Promo validation (`SHIELD10` only in local demo fallback).
- Custom subscription builder.
- Auth-aware checkout resume using `/pricing?checkout=<plan>`.
- Real charges are not simulated: `/billing/checkout` must return a payment-provider URL.

## Auth / registration
- Existing login no longer requires selecting a tariff first.
- Login and Registration are explicit modes on one screen.
- Phone → OTP → registration profile → success.
- Existing users can enter directly after OTP.
- Non-existing login can continue registration without confirming the phone again.
- OTP paste, resend timer, country prefixes, field validation and keyboard-friendly code input.
- Local demo fallback is visibly marked and uses code `1111`.
- API-ready service extracted to `services/auth/authService.js`.

## Performance
- `/auth` and `/pricing` are lazy route chunks.
- No chart/UI library was added.
- Motion relies mainly on transform/opacity and respects `prefers-reduced-motion`.
