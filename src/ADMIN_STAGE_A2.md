# Business Shield Admin — Stage A2: Clients

Раздел «Клиенты» переведён из макета в рабочую feature-архитектуру.

## Добавлено

- `/admin/clients` — реестр клиентов.
- `/admin/clients/:clientId` — детальная карточка клиента.
- Метрики: всего, активные, пробные, MRR клиентов.
- Поиск по названию, ИНН, email и телефону.
- Фильтры по статусу, тарифу и менеджеру.
- Сортировка по клиенту, выручке, рейтингу и сроку подписки.
- Создание клиента.
- Редактирование карточки.
- Изменение тарифа и переназначение менеджера.
- Контакты, подписка, KPI, активность за неделю, история действий и тикеты.
- Skeleton / empty / error / toast состояния.
- API-ready service с localStorage fallback.
- Переход из Dashboard в клиентский реестр и карточку клиента.

## API

Можно указать:

`REACT_APP_ADMIN_CLIENTS_ENDPOINT=https://api.example.com/admin/clients`

Ожидаемые операции:

- `GET /admin/clients`
- `POST /admin/clients`
- `PATCH /admin/clients/:clientId`

До подключения backend данные сохраняются в `localStorage`.
