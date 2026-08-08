# Stage A27 — Integration Provider Layer

## Что изменено

- Добавлен отдельный маршрут `/integrations` и полноценный Integration Hub.
- Яндекс.Бизнес, 2GIS, Ozon, Отзовик и Wildberries подняты в приоритетные источники.
- Google Business, Telegram, WhatsApp Business и AmoCRM сохранены как дополнительные подключения.
- Интеграции теперь имеют состояния `disconnected / needs_setup / configured / connected / syncing / degraded / expired / error`.
- Dashboard-виджет больше не содержит собственный менеджер подключений: он ведёт в единый Hub.
- Добавлены диагностика, ручной sync, reconnect, disconnect, журнал операций, last sync, provider mode и health score.
- Локальный fallback не имитирует реальный импорт. При отсутствии backend источник получает статус `configured` или `needs_setup`.
- Добавлена подготовка к внешней авторизации через `authorization_url` от backend.
- Данные интеграций остаются company-scoped и мигрируют с v1 cache на v2.
- Добавлены RBAC permissions `integrations.view` и `integrations.manage`.
- Integration Hub добавлен в sidebar, command search, presence mapping и route guards.
- Полностью поддержана A26 Appearance System: Hub имеет светлую и тёмную тему.

## Почему provider layer находится за backend

Frontend не обращается напрямую к закрытым API площадок и не хранит provider secrets. Конкретный способ подключения Яндекс / 2GIS / Ozon / Отзовика / Wildberries пока не определён, поэтому UI и domain model отделены от транспорта. Когда способ интеграции будет выбран, достаточно реализовать backend adapters под единый контракт A27.

## Runtime

```env
REACT_APP_INTEGRATIONS_ENDPOINT=https://api.example.ru/integrations
```

Если переменная отсутствует, интерфейс работает в честном configuration-only режиме и явно сообщает, что реальная синхронизация не выполняется.

## Основные файлы

```text
features/integrations/
├── IntegrationHub/
│   ├── IntegrationHubWorkspace.jsx
│   ├── IntegrationHubWorkspace.scss
│   └── index.js
├── hooks/
│   ├── useConnectedIntegrations.js
│   └── useIntegrationHub.js
└── model/integrationCatalog.js

services/integrations/
├── integrationProviderRegistry.js
└── integrationService.js

pages/portal/IntegrationsPage.jsx
```
