# Stage A20 — Unified Data Layer

Stage A20 переводит пользовательский кабинет из набора независимых mock/localStorage-моделей в единый data-flow, пригодный для подключения production API.

## 1. Что изменилось

### Dashboard больше не хранит KPI внутри JSX

Ключевые показатели, Reputation Pulse, графики отзывов, рейтинга, задач, процессов, отчётов, команды, безопасности и интеграций приходят через единый слой:

```text
DashboardPage
  └─ DashboardDataProvider
       └─ dashboardOverviewService
            ├─ GET REACT_APP_DASHBOARD_OVERVIEW_ENDPOINT   (production path)
            └─ feature services / scoped cache        (local/fallback path)
```

Виджеты не содержат собственные бизнес-цифры. Они отображают `loading / empty / error` и данные из provider.

### Aggregate-first загрузка

Если задан `REACT_APP_DASHBOARD_OVERVIEW_ENDPOINT`, Dashboard сначала делает **один агрегирующий запрос**. Он не запускает параллельно GET reviews/tasks/reports/profile/subscription/support.

Feature services используются только:

- когда aggregate API не подключён;
- как fallback первого запуска, если aggregate API недоступен и ещё нет overview-cache;
- внутри собственных страниц (`/tasks`, `/reports` и т.д.).

Это убирает каскад дублирующихся запросов при каждом обновлении Dashboard.

## 2. Состояния данных

`DashboardDataProvider` различает:

- `loading` — данных ещё нет;
- `ready` — актуальный snapshot;
- `stale` — API недоступен, показан сохранённый snapshot;
- `offline` — браузер офлайн, интерфейс продолжает работать с последними данными;
- `error` — нет ни API-ответа, ни usable cache.

Виджеты имеют собственные empty/loading/error states. При stale/offline существующие данные не исчезают — состояние показывается общей status strip.

## 3. Live revalidation

Dashboard обновляется:

- после изменения отзывов;
- после изменения задач;
- после формирования/изменения отчётов;
- после изменения интеграций;
- после изменения профиля;
- после изменения настроек безопасности;
- после изменения подписки;
- после возврата браузера online;
- при возврате на вкладку после длительной паузы;
- раз в 60 секунд, если подключён aggregate API и вкладка активна.

События debounce'ятся.

### Устранены циклы revalidation

GET-запросы feature services теперь кэшируют данные **без mutation event**. Mutation event отправляется только после реального изменения данных.

Это важно: раньше `GET -> write cache -> changed event -> GET` потенциально мог образовывать feedback loop.

Cross-tab обработчик также **не делает повторный API fetch при изменении самого overview cache**. Иначе две вкладки могли бы бесконечно перекидывать refresh друг другу.

## 4. State ownership

### Server state

Данные, которые в production принадлежат backend:

- reviews;
- tasks;
- reports;
- calendar events;
- profile/company/team snapshot;
- integrations;
- subscription/billing state;
- notifications;
- support threads;
- team security/presence/audit;
- dashboard overview.

LocalStorage для этих данных рассматривается только как scoped cache/local fallback, а не как база данных.

### Session state

Остаётся текущим состоянием браузерной сессии:

- auth token;
- `currentUser`;
- current company membership;
- PIN unlock state;
- browser session id.

Эти значения намеренно не смешиваются с server cache.

### UI preferences

Персональные настройки интерфейса принадлежат account scope:

- Dashboard layout;
- onboarding draft;
- first-run state;
- security preferences;
- Account Center preferences/cache.

## 5. Account / Company scoping

Добавлен `services/core/dataScope.js`.

Кэши теперь разделяются как минимум по двум пространствам:

```text
company-<id/inn>   — отзывы, задачи, отчёты, календарь, подписка, интеграции...
account-<user-id>  — профиль пользователя, Dashboard layout, first-run, уведомления...
```

Это предотвращает сценарий:

```text
пользователь A вышел
→ пользователь B вошёл в том же браузере
→ увидел cache пользователя A
```

### Legacy migration

Старые глобальные localStorage ключи мигрируются только один раз. Для каждого legacy cache фиксируется scope-владелец. Второй аккаунт/компания не может повторно импортировать тот же старый глобальный snapshot.

## 6. API client

Добавлен `services/core/apiClient.js`:

- единая обработка JSON/text/blob;
- credentials;
- AbortSignal;
- timeout;
- нормализованные API errors;
- один retry для безопасных GET при transient/network/5xx/429 ошибках;
- `Idempotency-Key` для create/checkout операций;
- `joinEndpoint()`.

Idempotency key уже используется для:

- создания задачи;
- генерации отчёта;
- создания события календаря;
- checkout подписки/pricing;
- отправки сообщения поддержки.

POST/PATCH/DELETE автоматически не retry'ятся.

## 7. Demo data

Добавлен `REACT_APP_ENABLE_DEMO_DATA`.

Поведение:

```text
REACT_APP_ENABLE_DEMO_DATA=true   -> разрешены демонстрационные snapshots
REACT_APP_ENABLE_DEMO_DATA=false  -> demo business data отключены
production без флага         -> demo business data отключены автоматически
```

В development demo data разрешены по умолчанию, чтобы UI можно было тестировать без backend.

Dashboard явно показывает `Demo data`, если используется этот режим.

Таким образом тестовые цифры больше не могут незаметно попасть в production UI.

## 8. Dashboard calculations

Локальные метрики теперь вычисляются из feature data:

- общий рейтинг — по ratings отзывов;
- coverage ответов — по фактическим reply/status;
- негатив — доля оценок <= 2;
- задачи/просрочки — по task state/dueDate;
- процессы — из реальных task statuses/checklists;
- team — из profile users;
- security — из PIN/autolock/sessions;
- integrations — из connected integrations;
- reports — из Reports service.

Периодные графики строятся по **реальным датам**, а не путём равномерного разбрасывания записей по точкам.

Для last-7-days подписи дней вычисляются относительно текущей даты.

## 9. Single source of truth

### Checklist

Dashboard Checklist больше не имеет отдельного набора задач в localStorage.

```text
Dashboard Checklist
        ↕
     Task Service
        ↕
      /tasks
```

Созданная в Dashboard задача появляется в основном разделе задач и наоборот.

### Calendar

Calendar вынесен в `dashboardCalendarService` и больше не содержит seed-события внутри компонента.

Поддерживаются API/cache/local states.

## 10. Animated live updates

`AnimatedValue` плавно обновляет числовые KPI без remount всей страницы.

Используются `requestAnimationFrame + transform/opacity/SVG`, с поддержкой `prefers-reduced-motion`.

Число `null` теперь корректно отображается как `—`, а не `0`.

## 11. Production notes

Frontend cache не является источником авторизации/безопасности. Backend обязан самостоятельно проверять:

- user/session;
- company membership;
- RBAC permissions;
- frozen/expired access;
- subscription entitlements;
- idempotency;
- ownership каждого requested resource.

При подключении production backend рекомендуется начать с `REACT_APP_DASHBOARD_OVERVIEW_ENDPOINT`, а затем постепенно подключить feature endpoints.
