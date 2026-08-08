# Admin Stage A6-A8 — Core Complete

Этот этап закрывает оставшиеся основные разделы административного кабинета и переводит sidebar из частично активного состояния в полноценный рабочий контур.

## A6 — Подписки / Billing Control

- `/admin/subscriptions`
- MRR, ARR, активные подписки, renewal rate
- график выручки по тарифам
- renewal radar и риск продления
- реестр подписок клиентов
- смена тарифа клиента
- включение/отключение автопродления
- карточки тарифов и редактор тарифного плана
- список предстоящих продлений
- финансовая live-лента
- localStorage fallback и API-ready сервис

## A7 — Аналитика / Intelligence Layer

- `/admin/analytics`
- MRR, Clients, Churn, ARPU
- период: месяц / квартал / год
- MRR chart
- новые клиенты vs отток
- рост по тарифам
- Churn Rate
- Smart Insights
- статистика по Яндекс.Картам, 2GIS, Google Maps, Отзовику и Tripadvisor
- лёгкие SVG-графики без charting library

## A8 — Настройки / System Configuration

- `/admin/settings`
- вкладки через `?tab=`
- тарифы
- уведомления + SMTP
- интеграции
- шаблоны ответов
- безопасность и audit log
- сохранение в localStorage до подключения backend

## Дополнительно

- Все пункты Admin sidebar теперь активны.
- Глобальный Admin Search (`Ctrl/Cmd + K`) умеет переходить между основными разделами и ключевыми вкладками настроек.
- Уведомления в header ведут в связанные разделы.
- В профиле Admin появился быстрый переход в настройки безопасности.
- Анимации используют преимущественно `transform`, `opacity` и SVG `stroke-dashoffset`; постоянный тяжёлый blur не используется.
- Все новые разделы поддерживают `prefers-reduced-motion`.

## API environment

- `REACT_APP_ADMIN_SUBSCRIPTIONS_ENDPOINT`
- `REACT_APP_ADMIN_ANALYTICS_ENDPOINT`
- `REACT_APP_ADMIN_SETTINGS_ENDPOINT`
