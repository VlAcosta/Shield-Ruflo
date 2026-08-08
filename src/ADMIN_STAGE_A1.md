# Admin Stage A1 — Foundation + Dashboard

## Реализовано
- отдельный AdminLayout с тёмным sidebar и независимым topbar;
- отдельная Admin PIN-блокировка, клавиатура/NumPad/Backspace/Delete/Enter/Escape;
- lazy route `/admin/dashboard`;
- пользовательский кабинет открывается из admin header;
- локальный центр событий и меню администратора;
- поиск по блокам текущего dashboard;
- API-ready service `services/admin/adminDashboardService.js`;
- skeleton/error/refresh states;
- responsive admin shell;
- полноценный dashboard по структуре макета: KPI, выручка, тарифы, последние клиенты, тикеты, менеджеры, выручка по менеджерам.

## Временный API fallback
Если `REACT_APP_ADMIN_DASHBOARD_ENDPOINT` не задан, используются локальные данные из `adminDashboardData.js`.

## PIN
По умолчанию для текущего дизайн-прототипа используется `4321`, как в макете Admin CRM.
Можно переопределить через `REACT_APP_ADMIN_PIN` или `localStorage['business-shield:admin-pin']`.

## Следующий этап
Admin Clients: реестр, фильтры, создание клиента и детальная карточка клиента.
