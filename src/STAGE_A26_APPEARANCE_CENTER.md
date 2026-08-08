# Stage A26 — Appearance Center

## Что изменилось

- Тема перестала быть настройкой только Dashboard.
- Добавлен account-scoped Appearance Center: `Светлая / Тёмная / Системная`.
- Системный режим слушает `prefers-color-scheme` и меняется без перезагрузки.
- Тёмная тема распространена на Portal shell и основные пользовательские feature: Dashboard, Reviews Intelligence, Reputation Intelligence, Automation Engine, Tasks, Reports, Subscriptions, Notifications, Profile, Team/Security, Support Chat и FAQ.
- Старое значение Dashboard theme мягко мигрируется в новую настройку оформления.
- В Profile добавлена вкладка `Оформление` и быстрый переход из меню пользователя.
- Оформление хранится отдельно для каждого аккаунта.
- Dashboard quick-toggle сохранён как быстрый переключатель; если был выбран `System`, ручной toggle переводит тему в явный Light/Dark.
- `prefers-reduced-motion` учитывается в Appearance Center и переходах темы.

## Архитектура

- `services/appearance/appearanceService.js`
- `features/appearance/hooks/useAppearance.js`
- `features/profile/AppearanceProfile/*`
- `styles/portalAppearance.scss`

`PortalLayout` является единственной точкой, которая применяет тему к документу. Feature hooks читают то же состояние, но не конкурируют за body/document classes.
