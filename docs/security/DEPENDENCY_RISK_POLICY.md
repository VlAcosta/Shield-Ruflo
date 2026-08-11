# Business Shield Dependency Risk Policy

## Purpose

Business Shield treats dependency vulnerabilities as release risks, not as informational noise.

## Release policy

- Critical vulnerabilities in production dependencies block release.
- High vulnerabilities in production dependencies block release unless an accepted-risk record exists with owner, rationale, compensating controls, expiration date, and remediation plan.
- Development/build dependency vulnerabilities are tracked separately from the production runtime graph.
- `npm audit fix --force` must never be applied automatically. Breaking upgrades require review and normal CI/E2E validation.
- Lockfiles are authoritative and `npm ci` is the required install mode in CI and production build pipelines.

## Accepted-risk record

Every temporary exception must contain:

- package/advisory identifier;
- affected package and version range;
- production or development/build classification;
- exploitability assessment in the Business Shield architecture;
- compensating controls;
- named owner;
- expiration date;
- planned remediation stage/PR.

Expired exceptions are release blockers.

## Current accepted risks

None.
