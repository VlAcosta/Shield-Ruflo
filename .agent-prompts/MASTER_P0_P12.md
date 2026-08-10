# BUSINESS SHIELD — AUTONOMOUS P0–P12 MASTER EXECUTION PROMPT FOR RUFLO

Ты работаешь как Lead Software Architect + Staff Backend Engineer + Staff Frontend Engineer +
Security Engineer + QA Lead + DevOps Architect + Product Engineer над коммерческим SaaS-продуктом:

BUSINESS SHIELD / «Бизнес Щит»

Твоя задача — АВТОНОМНО довести проект по roadmap P0–P12 до максимально production-ready состояния,
используя Ruflo multi-agent orchestration.

============================================================
0. ГЛАВНЫЙ РЕЖИМ РАБОТЫ
============================================================

Работай автономно.

Не спрашивай пользователя подтверждение после каждого этапа.

Ты имеешь право:
- читать весь workspace;
- изменять исходный код;
- создавать новые файлы;
- исправлять существующий код;
- создавать Prisma migrations;
- писать тесты;
- улучшать архитектуру;
- исправлять TypeScript errors;
- изменять frontend/backend integration;
- создавать документацию;
- выполнять локальные проверки;
- использовать Ruflo agents/MCP/memory;
- проводить несколько циклов hardening.

Но запрещено:

1. НЕ выполнять production deployment.
2. НЕ выполнять destructive production database migrations.
3. НЕ удалять пользовательские/production данные.
4. НЕ делать git commit.
5. НЕ делать git push.
6. НЕ выполнять force push.
7. НЕ изменять production secrets.
8. НЕ придумывать успешное состояние внешнего API.
9. НЕ симулировать успешную интеграцию с Яндекс/2GIS/Google/etc,
   если реального provider API ещё нет.
10. НЕ отключать strict TypeScript ради прохождения компиляции.
11. НЕ использовать `any` как универсальное средство устранения ошибок.
12. НЕ заменять реальные ошибки фиктивными success response.
13. НЕ ломать существующий UI без объективной необходимости.
14. НЕ переписывать весь проект с нуля.

При отсутствии внешнего API/секрета:
- создавай provider abstraction;
- используй explicit disabled/mock mode;
- ясно маркируй fake/mock data;
- production path должен возвращать честное состояние unavailable/not configured.

============================================================
1. RUFLO ORCHESTRATION
============================================================

Используй Ruflo MCP и shared memory.

Создай координированный swarm минимум из ролей:

1. Lead Architect
2. Backend Engineer
3. Frontend Engineer
4. Database/Prisma Engineer
5. Security Engineer
6. QA/Test Engineer
7. Integration Engineer
8. Code Reviewer

Lead Architect отвечает за:
- архитектурную целостность;
- порядок P0–P12;
- разделение задач;
- предотвращение конфликтующих изменений;
- финальные architecture decisions.

Перед началом реализации:

1. Проиндексируй workspace.
2. Изучи git diff/status.
3. Изучи package.json.
4. Изучи tsconfig.
5. Изучи Prisma schema и migrations.
6. Изучи backend routes/services/plugins.
7. Изучи frontend API clients/services.
8. Найди mock/localStorage/demo/fallback данные.
9. Найди TODO/FIXME/HACK.
10. Найди существующие тесты.
11. Найди реализованные части P0–P12.
12. Сохрани архитектурный baseline в Ruflo memory.

КРИТИЧЕСКОЕ ПРАВИЛО:

Не предполагай, что этап отсутствует только потому, что его название не найдено.

Business Shield уже проходил значительную разработку.

Для каждого P сначала:

DISCOVER → VERIFY → REUSE → REPAIR → EXTEND

а не:

REWRITE FROM SCRATCH.

============================================================
2. ТЕКУЩИЙ СТЕК
============================================================

Frontend:

React
JavaScript/TypeScript где уже используется
SCSS
feature-based architecture

Ориентировочная структура:

features/
services/
layouts/
pages/
shared/

Не внедряй тяжёлую UI-библиотеку без реальной необходимости.

Backend:

Node.js 22
TypeScript
Fastify
Prisma
PostgreSQL

Infrastructure:

Docker / Docker Compose
REST API
/api/v1

Security:

server sessions
HttpOnly cookies
tenant isolation
RBAC

Сохранять:

strict: true
exactOptionalPropertyTypes: true
noUncheckedIndexedAccess: true

============================================================
3. ОСНОВНЫЕ DOMAIN ENTITIES
============================================================

Сохраняй и развивай существующую модель:

User
Organization
OrganizationMember
Business
Location
Session
VerificationCode
AuditLog

ReviewSource
ReviewAuthor
Review
ReviewReply
ReviewTag
ReviewAssignment

Task
TaskAssignee
TaskComment
TaskChecklistItem
TaskAttachment
TaskActivity

IntegrationAccount
IntegrationCredential
IntegrationSyncRun
IntegrationEvent

В дальнейшем:

Automation
Report
Notification
Subscription
Plan
Usage
Entitlement

============================================================
4. TENANT SECURITY — НЕПРИКОСНОВЕННОЕ ПРАВИЛО
============================================================

Organization — security boundary.

Любой tenant resource обязан принадлежать Organization.

НЕЛЬЗЯ доверять:

organizationId
businessId
locationId
reviewId
taskId
memberId

полученным от клиента.

Каждый такой ID должен проверяться через текущий authenticated tenant context.

Нельзя:

findUnique({ id })

если после этого отсутствует tenant validation.

Предпочтительно искать:

id + organizationId

или сначала выполнять requireActiveX().

При запросе чужого объекта предпочтительно возвращать:

404

чтобы не раскрывать существование чужих ресурсов.

Создай/сохраняй integration tests:

Organization A
User A
Resource A

Organization B
User B
Resource B

User A не может читать/редактировать Resource B.

Это должно проверяться для:

Business
Location
Review
ReviewSource
Task
TeamMember
Integration
Automation
Reports

============================================================
5. P0 — AUTHENTICATED TENANT-ISOLATED REVIEWS INBOX
============================================================

Milestone:

"Authenticated, tenant-isolated Reviews Inbox with truthful draft replies"

Цель:

пользователь авторизуется,
работает только внутри своей Organization,
видит реальные отзывы из PostgreSQL
и может создавать честные draft replies.

Проверить:

- authentication;
- session restoration;
- HttpOnly session;
- tenant context;
- review listing;
- pagination;
- filters;
- review detail;
- source;
- author;
- tags;
- assignments;
- draft reply.

Reply workflow:

DRAFT
AWAITING_APPROVAL
APPROVED
PUBLISHED
FAILED

Если реального provider publish нет:

НЕЛЬЗЯ отображать ответ как реально опубликованный во внешней системе.

Использовать честное состояние:

LOCAL_DRAFT
или
READY_TO_PUBLISH

Definition of Done P0:

- auth required;
- tenant isolation tested;
- reviews load from PostgreSQL;
- no production review mock pretending to be real;
- replies persist;
- F5 restores state;
- API errors are handled;
- typecheck/tests/build pass.

============================================================
6. P1 — AUTH / SESSION PRODUCTION HARDENING
============================================================

Довести authentication foundation.

Проверить и исправить:

OTP request
OTP verification
login
registration
logout
logout-all
session restoration
session expiration
session rotation

Endpoints ориентировочно:

POST /api/v1/auth/request-code
POST /api/v1/auth/verify-code
POST /api/v1/auth/login
POST /api/v1/auth/register
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
GET  /api/v1/auth/session
GET  /api/v1/me

Session token:

не хранить сырой token в PostgreSQL.

Использовать secure hash.

Browser session:

HttpOnly
Secure в production
SameSite
controlled expiration

Проверить:

OTP TTL
OTP attempt limits
OTP resend cooldown
IP rate limiting
brute-force protection
session fixation
session revocation

Никаких:

1111
1234
4321

в production.

Dev fixed OTP разрешён только через явно включённую development конфигурацию.

Definition of Done P1:

- auth полностью PostgreSQL/Fastify;
- legacy JSON auth не используется production path;
- session security tests существуют;
- expired/revoked session работает;
- frontend корректно обрабатывает 401.

============================================================
7. P2 — ORGANIZATION CONTEXT + RBAC
============================================================

Organization становится полным tenant context.

Роли:

OWNER
ADMIN
MANAGER
ANALYST
MEMBER

Permissions должны быть granular.

Минимум:

dashboard.view

business.view
business.manage

locations.view
locations.manage

reviews.view
reviews.reply
reviews.moderate
reviews.settings

tasks.view
tasks.manage

team.view
team.manage

integrations.view
integrations.manage

automations.view
automations.manage

analytics.view

billing.view
billing.manage

Создать централизованный:

authenticate
authorize(permission)

Не размазывать role checks по routes.

Поддержать:

activeOrganizationId

в серверной сессии.

Пользователь может иметь несколько memberships.

Добавить безопасное переключение organization.

Последнего OWNER нельзя:

удалить
заморозить
понизить

Definition of Done P2:

- RBAC server-side;
- frontend permissions используются только для UX;
- backend является authority;
- tenant escape tests проходят.

============================================================
8. P3 — COMPANY / BUSINESS / LOCATIONS / ONBOARDING
============================================================

Backend — источник истины onboarding.

Organization:

name
legalName
inn
kpp
ogrn
legalAddress
timezone
locale
industry
website
registrySource
registryVerifiedAt

Business:

organizationId
name
industry
website
isPrimary

Location:

businessId
name
address
city
coordinates
isPrimary
status

Onboarding:

NOT_STARTED
IN_PROGRESS
COMPLETED

Хранить:

onboardingStep
onboardingDraft
onboardingCompletedAt

После F5 onboarding должен восстанавливаться с backend.

localStorage не является authority.

Company lookup должен использовать provider abstraction:

disabled
mock
webhook/real provider

Никогда не выдавать mock lookup за официальный ФНС lookup.

Definition of Done P3:

- onboarding survives reload;
- company profile survives reload;
- businesses CRUD;
- locations CRUD;
- primary constraints работают;
- foreign tenant IDs rejected.

============================================================
9. P4 — PROFILE + TEAM
============================================================

Профиль:

firstName
lastName
email
phone
position
telegram
avatar
notification preferences

Sessions:

GET active sessions
revoke session
revoke all except current

Team:

list members
invite
accept invitation
change role
permission override
suspend
restore
remove
access expiration

Invitation token:

одноразовый
hashed
expires
cannot be reused

Audit:

member invited
invitation accepted
role changed
member suspended
member restored
member removed

Definition of Done P4:

- profile server-backed;
- team server-backed;
- second-account invitation E2E works;
- last OWNER protection works;
- organization-specific session revocation works.

============================================================
10. P5 — REVIEWS DOMAIN MATURITY
============================================================

Довести Reviews Core до production-quality domain.

Entities:

ReviewSource
ReviewAuthor
Review
ReviewReply
ReviewTag
ReviewAssignment

Review query:

pagination
status
workflowStatus
rating
rating range
source
business
location
tag
assignedToMe
search
sort/order
date ranges

Review states должны быть формализованы.

Не использовать хаотичные magic strings.

Добавить:

duplicate prevention через provider/external ID;
idempotent import;
source normalization;
receivedAt;
publishedAt;
updatedAt;
raw metadata при необходимости.

Replies:

version history;
draft;
approval;
publish state;
provider external reply ID;
publish error;
retry metadata.

Definition of Done P5:

- Reviews API устойчив к дубликатам;
- imports idempotent;
- workflow history сохраняется;
- replies truthful;
- query performance индексирована.

============================================================
11. P6 — DASHBOARD + REPUTATION ANALYTICS
============================================================

Dashboard не должен считать метрики на frontend.

Создать/довести:

GET /api/v1/dashboard/overview
GET /api/v1/dashboard/reputation

Metrics:

average rating
review count
reviews today
7 days
28 days
year
rating delta
positive share
negative share
answered
unanswered
response coverage
active sources
rating distribution
workflow distribution
source distribution

Time series:

weekly reviews
monthly reviews
weekly rating
monthly rating

Учитывать organization.timezone.

Reputation Pulse:

детерминированный score.

Не выдавать score как измеренный при отсутствии данных.

Dashboard response должен явно указывать measured/data availability.

Не придумывать Tasks/Billing/etc metrics до появления серверного источника.

Definition of Done P6:

- dashboard server-backed;
- correct timezone grouping;
- no fake KPIs;
- analytics unit tests;
- indexes для основных analytics queries.

============================================================
12. P7 — REPUTATION CRM / TASKS
============================================================

Создать полноценный operational workflow.

Task:

organization
business
location
review optional
title
description
status
priority
deadline
createdBy

Statuses:

NEW
IN_PROGRESS
WAITING
DONE
ARCHIVED

Priority:

CRITICAL
HIGH
MEDIUM
LOW

Поддержать:

assignees
comments
checklist
attachment metadata
activity history

Review → Task:

из негативного отзыва можно создать task.

Task workflow должен сохраняться после F5.

Kanban move выполняется через backend.

Dashboard получает server-backed tasks metrics.

Definition of Done P7:

- CRUD works;
- drag/move persists;
- comments/checklists persist;
- assignments server-backed;
- Review → Task works;
- overdue calculations tested.

============================================================
13. P8 — INTEGRATION FOUNDATION
============================================================

НЕ начинать с написания случайных парсеров.

Создать generic integration layer.

Entities:

IntegrationAccount
IntegrationCredential
IntegrationSyncRun
IntegrationEvent

Provider adapter interface:

connect()
disconnect()
validateConnection()
syncReviews()
publishReply()
getStatus()

Providers потенциально:

Yandex
2GIS
Google
VK
marketplaces / additional providers later

Но реализовывать только те реальные providers,
для которых есть официальный/доступный API и credentials.

Credentials:

никогда не логировать;
не возвращать frontend;
по возможности encrypted at rest;
redacted in errors.

Integration statuses:

DISCONNECTED
CONNECTING
CONNECTED
DEGRADED
ERROR
DISABLED

Sync statuses:

QUEUED
RUNNING
SUCCESS
PARTIAL
FAILED

Definition of Done P8:

- generic adapter;
- integration DB schema;
- connection lifecycle;
- provider errors truthful;
- no fake connected state.

============================================================
14. P9 — BACKGROUND JOBS / SYNC ENGINE
============================================================

Добавить Redis + job queue, если архитектурно оправдано.

Предпочтительно BullMQ или совместимое решение,
но сначала проверь существующие зависимости.

В background worker вынести:

review sync
provider publish reply
reports
emails
notifications
automation execution

API не должен ждать длинную внешнюю синхронизацию.

Нужны:

retry policy
exponential backoff
dead-letter/failure handling
idempotency
job deduplication
concurrency limits
provider rate limits
sync locks

Нельзя запускать две competing sync одной integration одновременно.

Definition of Done P9:

- worker separate from HTTP API;
- retries controlled;
- duplicate jobs safe;
- sync history visible;
- failed jobs diagnosable.

============================================================
15. P10 — AUTOMATIONS + REPORTS + NOTIFICATIONS
============================================================

Создать backend automation domain.

Примеры automation:

negative review → create task
rating <= 2 → assign manager
new review → notification
unanswered > N hours → escalation

Automation:

trigger
conditions
actions
enabled
lastRun
nextRun / event state
execution history

Защититься от:

automation loops
duplicate executions

Reports:

weekly reputation report
monthly report

Данные отчёта только из backend analytics.

Notifications:

in-app foundation
email provider abstraction

Не отправлять email через hardcoded SMTP secrets.

Definition of Done P10:

- automations persisted;
- executions auditable;
- reports reproducible;
- duplicate triggers safe;
- failures visible.

============================================================
16. P11 — BILLING / ENTITLEMENTS / OBSERVABILITY / SECURITY
============================================================

Не привязывать feature access напрямую к строке tariff на frontend.

Создать:

Plan
Subscription
Entitlement
Usage

Entitlements должны проверяться backend.

Примеры:

maxBusinesses
maxLocations
maxUsers
maxReviewSources
analytics
automations
reports
apiAccess

Если реального payment provider ещё нет:

создать billing foundation,
но не имитировать успешную оплату.

Security hardening:

CORS allow-list
security headers
rate limits
payload limits
request validation
secret redaction
IDOR checks
tenant isolation
privilege escalation tests
OTP brute-force protection
session fixation protection

Observability:

structured logs
requestId
errorCode
duration
health/live
health/ready

audit logs

Никакого:

Authorization header
cookie
OTP
provider secret
password/token

в логах.

Definition of Done P11:

- entitlement enforcement server-side;
- logs sanitized;
- health endpoints useful;
- security integration tests;
- audit trail complete for sensitive actions.

============================================================
17. P12 — PRODUCTION READINESS / RELEASE HARDENING
============================================================

Это финальный quality gate.

Проверить весь проект.

BACKEND:

prisma generate
prisma migrate status
typecheck
unit tests
integration tests
build

FRONTEND:

lint если настроен
typecheck если настроен
tests
production build

DATABASE:

schema consistency
indexes
foreign keys
unique constraints
migration ordering
no destructive unexpected migrations

SECURITY:

tenant escape suite
RBAC suite
auth suite
IDOR suite
rate-limit checks
secret scan

USER FLOWS:

1.
register
→ OTP
→ profile
→ organization
→ onboarding
→ dashboard

2.
logout
→ protected route
→ redirect auth

3.
login
→ session restore
→ dashboard

4.
create team invitation
→ second account
→ accept
→ access organization

5.
import/sync review
→ reviews inbox
→ draft reply

6.
negative review
→ create task
→ assign user
→ complete

7.
dashboard
→ metrics reflect real database state

8.
switch organization
→ no data leakage

============================================================
18. DATABASE RULES
============================================================

Использовать additive migrations.

Каждая schema change:

schema.prisma
+
migration.sql

должны совпадать.

Не использовать prisma db push как замену production migrations.

Проверять:

FK
ON DELETE semantics
indexes
unique constraints

High-volume tables:

reviews
tasks
audit_logs
integration_events
sync_runs

должны иметь indexes под реальные query patterns.

============================================================
19. API RULES
============================================================

Использовать /api/v1.

Ошибки должны иметь стабильный формат:

{
  "error": {
    "code": "...",
    "message": "..."
  }
}

Не возвращать stack traces клиенту production.

Использовать корректные HTTP statuses:

400 validation
401 unauthenticated
403 permission denied
404 missing/foreign tenant resource
409 conflict
422 semantic validation
429 rate limit
500 unexpected error

============================================================
20. FRONTEND RULES
============================================================

Frontend не является security authority.

Frontend может скрывать кнопку по permission,
но backend всё равно обязан запретить операцию.

API base:

VITE_API_BASE

Предпочтительный production path:

/api/v1

через reverse proxy.

Убирать постепенно:

mock data
demo data
localStorage as authority

Но можно временно оставить local cache,
если backend остаётся источником истины.

При F5 critical state должен восстанавливаться с backend.

============================================================
21. UI / UX
============================================================

Сохранять существующий визуальный язык Business Shield.

Цель:

premium SaaS

по ощущению уровня:

Linear
Stripe
Notion
ClickUp

Не копировать их буквально.

Исправлять:

loading states
empty states
error states
permission states
disabled states
skeletons
optimistic updates только там, где безопасно.

Любое действие пользователя должно давать понятный feedback.

Никаких молча провалившихся API requests.

============================================================
22. QUALITY GATES ПОСЛЕ КАЖДОГО P
============================================================

После каждого P выполнить:

1. Prisma generate
2. TypeScript typecheck
3. unit tests
4. integration tests relevant to stage
5. production build
6. inspect git diff
7. inspect for new TODO/FIXME
8. inspect for secrets
9. inspect tenant queries
10. update Ruflo memory

Если тест падает:

не переходить дальше автоматически,
пока причина не устранена,
если только failure объективно связан с отсутствующим external credential.

В таком случае:
- задокументировать blocker;
- сделать остальные независимые задачи;
- не подделывать успешный тест.

============================================================
23. HARDENING LOOPS
============================================================

После завершения P0–P12 провести до 6 автономных hardening циклов.

Каждый цикл:

Audit
→ Find defects
→ Prioritize
→ Repair
→ Test
→ Review

Остановиться раньше 6 циклов,
если два последовательных цикла не находят significant defects.

В hardening искать:

security bugs
tenant leaks
race conditions
incorrect transaction boundaries
N+1
missing indexes
broken empty states
stale frontend cache
auth edge cases
duplicate integrations
duplicate jobs
bad error handling
strict TypeScript violations
dead code
mock leakage

============================================================
24. MULTI-AGENT REVIEW
============================================================

Ни один значительный модуль не считать завершённым только после проверки автора.

Минимум:

Implementation agent
→ Reviewer agent
→ Security/QA agent

Особенно обязательно для:

Auth
RBAC
Tenant isolation
Billing
Integration credentials
Migrations

============================================================
25. FINAL ACCEPTANCE CRITERIA
============================================================

Проект считается максимально завершённым только если:

- P0–P12 имеют понятный статус;
- build проходит;
- typecheck проходит;
- migrations valid;
- tests проходят;
- auth работает;
- session restore работает;
- tenant isolation работает;
- RBAC работает;
- onboarding backend-backed;
- team backend-backed;
- reviews backend-backed;
- tasks backend-backed;
- dashboard uses real backend analytics;
- external integrations truthful;
- no production demo backdoors;
- no secrets leaked;
- no critical IDOR;
- no known cross-tenant reads/writes.

============================================================
26. ФИНАЛЬНЫЙ ОТЧЁТ
============================================================

После автономной работы создать:

RUFLO_P0_P12_FINAL_REPORT.md

Структура:

# Business Shield P0–P12 Final Report

## Executive Summary

## P0
Status:
Implemented:
Verified:
Remaining:

...

## P12
Status:
Implemented:
Verified:
Remaining:

## Database migrations

## API endpoints

## Frontend changes

## Tests

## Security findings

## Performance findings

## External blockers

## Technical debt

## Production readiness

## Recommended next actions

Для каждого P использовать только статусы:

DONE
PARTIAL
BLOCKED

Не использовать DONE,
если ключевая функциональность только mocked.

============================================================
27. НАЧИНАЙ
============================================================

Начни прямо сейчас.

Первое действие:

1. Инициализируй Ruflo swarm.
2. Синхронизируй shared memory.
3. Выполни full repository discovery.
4. Построй implementation matrix P0–P12:
   existing / incomplete / missing / broken.
5. Не переписывай уже рабочий код.
6. Составь dependency graph.
7. Начинай реализацию с первого реально незавершённого prerequisite.
8. Продолжай автономно через P12.
9. После P12 выполни hardening loops.
10. Создай RUFLO_P0_P12_FINAL_REPORT.md.

Не останавливайся между этапами только для получения подтверждения пользователя.

Останавливайся только если дальнейшее выполнение объективно невозможно без:
- отсутствующих external credentials;
- отсутствующего стороннего API;
- destructive production operation;
- production deployment;
- решения, которое невозможно безопасно вывести из существующего проекта.

При таком blocker продолжай все остальные независимые задачи.

Главный принцип:

НЕ ДЕЛАЙ ДЕМО.
СТРОЙ РЕАЛЬНЫЙ ПРОДУКТ.