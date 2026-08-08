# Stage A22 — Stabilization & QA

## Выполнено

- Удалены все `import.meta.env` из runtime-кода. Текущий проект собирается через CRA/webpack, поэтому Vite-only доступ к env был источником несовместимости.
- Добавлен `services/core/runtimeEnv.js`. Канонические frontend-переменные теперь `REACT_APP_*`; hosting layer также может передать публичную конфигурацию через `window.__BUSINESS_SHIELD_ENV__`.
- Все основные portal routes переведены на `React.lazy`, включая Dashboard, Onboarding, Subscriptions, Reports, Tasks, Profile, Notifications, Chat, FAQ, Reputation и Automations.
- Добавлен глобальный `AppErrorBoundary` с recovery UI и событием `business-shield:runtime-error`.
- Убрана старая локальная автоматизация создания задач из `useReviewsIntelligence`: теперь один источник автоматизаций — Automation Engine.
- Периодическая проверка Automation Engine выполняется раз в 5 минут только при видимой вкладке и блокируется от параллельного запуска.
- Для автоматизаций добавлен execution ledger, чтобы повторное событие не создавало дубликаты задач/уведомлений.
- Документация env приведена к CRA-формату `REACT_APP_*`.

## Проверки исходников

- TypeScript `transpileModule` для JS/JSX: 360 файлов, 0 syntax errors.
- Relative import scan: 768 imports, 0 missing.
- SCSS/CSS brace scan: 114 файлов, 0 ошибок структуры.
- `import.meta` references: 0.

## Что нельзя объективно подтвердить по переданному архиву

Архив содержит `src`, но не содержит рабочего `package.json`, lock-файла и build-конфигурации проекта. Поэтому `npm run build` не заявляется как пройденный. Необходимо прогнать production build в исходном репозитории после применения patch.

## Smoke matrix после применения в реальном репозитории

1. `/auth` → login/register/invite.
2. `/onboarding` → организация → интеграции → PIN → Dashboard.
3. Refresh на каждом protected route.
4. Back/Forward после onboarding и checkout.
5. Две вкладки: reviews/tasks/notifications.
6. Открытие/закрытие notification menu 20–30 раз без роста запросов/lag.
7. RBAC: owner/admin/moderator/guest + custom role.
8. Forced logout/frozen/temporary access.
9. Offline → cached Dashboard → reconnect.
10. `/reviews`, `/reputation`, `/automations` с пустыми данными и demo-data off.
