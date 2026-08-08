# Stage A18 — Team Security & Session Control

Stage A18 extends the company RBAC system with a security layer for each team member.

## What changed

- Team Access Center now has a dedicated **Безопасность** area.
- Every member has `Доступ / Устройства / Безопасность` inspector modes.
- Company admins can freeze/unfreeze a member without deleting the account.
- Temporary access can be limited by a date and is enforced by the portal security gate.
- Invitations can already carry an `accessExpiresAt` date.
- Member browser sessions are registered and shown in the Team Access Center.
- Admins can revoke one device session or force logout from all devices.
- Portal shows a dedicated blocking screen for frozen, expired, or remotely revoked access.
- Security activity includes PIN changes, auto-lock policy changes, role/permission changes, freezes, expiry changes, and session revocation.
- New RBAC permission: `team.manage_security`.

## Local/demo storage

- `business-shield:team-security:v1` — member security policies and demo session registry.
- sessionStorage `business-shield:member-session-id:*` — current browser-tab session identifier.

The local implementation is useful for development and same-browser testing. Cross-device revocation requires the backend endpoint below because localStorage is not shared across browsers/devices.

## Motion / design

The security center uses lightweight transform/opacity animations, an orbit status visual, staggered device rows and event rows, and no permanent full-screen blur. `prefers-reduced-motion` is respected.
