# Data ownership — Бизнес Щит

## Server state

В production backend является источником истины для:

| Домен | Scope | Frontend cache |
|---|---|---|
| Reviews | company | `business-shield:reviews:<company>` |
| Tasks | company | `business-shield:tasks:snapshot:v1:<company>` |
| Reports | company | `business-shield:reports:snapshot:v1:<company>` |
| Calendar | company | `business-shield:dashboard-calendar:v3:<company>` |
| Integrations | company | `business-shield:integrations:v1:<company>` |
| Subscription | company | `business_shield_subscription_state_v1:<company>` |
| Support | company | `business-shield:support:snapshot:v1:<company>` |
| Activity / presence | company | scoped company cache |
| Team security | company | scoped company cache |
| Profile personal | account | `business-shield:profile:snapshot:v1:<account>` |
| Notifications | account | `business-shield:notifications:snapshot:v1:<account>` |
| Account Center | account | `business-shield:account:center:v1:<account>` |
| Dashboard overview | company | `business-shield:dashboard:overview:v2:<company>` |

`localStorage` здесь — cache/fallback. Backend должен оставаться source of truth.

## Session state

Не следует превращать в server cache:

- `token`;
- `currentUser`;
- current company membership;
- `portal_pin_unlocked`;
- sessionStorage browser session id.

## UI state / preferences

Может жить локально и синхронизироваться позже:

- Dashboard layout — account scope;
- Dashboard first-run state — account scope;
- onboarding draft — account scope;
- PIN/autolock preferences — account scope;
- временно выбранные фильтры/табы — component state или URL.

## Cross-account handoff state

Некоторые данные намеренно не привязаны к текущему account до авторизации:

- invite token registry в local demo;
- pending checkout до завершения регистрации.

В production эти сценарии должны жить на backend по opaque token/id, а не в localStorage.
