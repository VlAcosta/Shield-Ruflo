# Stage A16 — Dashboard UX & Team Access

Этап закрывает UX-ошибки рабочего Dashboard и превращает приглашение пользователей в полноценный сценарий входа в компанию.

## Что изменено

- Onboarding работает в immersive-режиме: верхнее и боковое меню не рендерятся до завершения первичной настройки.
- Исправлен цикл обновления уведомлений, который мог вызывать повторные загрузки и лаги при открытии popover. Дополнительно убран постоянный blur с основного topbar.
- PeriodMenu перенесён в portal (`document.body`) и позиционируется относительно viewport: выпадающий период больше не обрезается границами KPI/card.
- ReviewsChart, TasksChart и Rating показывают tooltip/детали только при hover или keyboard focus.
- Rating переработан: компактный score gauge, reputation health, динамика оценки и корректное заполнение высоты карточки.
- Calendar полностью переработан: текущая дата, 42 ячейки, соседние месяцы, agenda, upcoming events, создание события и localStorage fallback.
- Checklist получил полноценный сценарий `+ Создать`: задача, приоритет, исполнитель, срок и комментарий.
- `Предложить идею` теперь открывает форму с категорией, темой, описанием и контактами. Поддержаны API, email fallback и локальная очередь.
- Invite User перенесён в portal поверх всего кабинета. Header больше не остаётся поверх затемнения; heavy backdrop blur удалён.
- Приглашение создаёт персональную ссылку `/auth?invite=<token>` и pending-пользователя в команде.
- Приглашённый пользователь проходит отдельный flow: приглашение → SMS → личный PIN → кабинет существующей компании.
- Для участника сохраняются company membership и роль. Организационный onboarding повторно не запускается.
- В профиле участника используются его собственные имя/email/телефон, а не данные владельца локального demo snapshot.
- Admin role получает управление компанией и пользователями. Moderator/Guest не видят административные вкладки `Компания` и `Пользователи` в Profile menu.

## Локальные ключи

- `business-shield:company-invitations:v1`
- `business-shield:company-membership:v1`
- `business-shield:dashboard-calendar:v2`
- `business-shield:dashboard-checklist:v2`
- `business-shield:suggestions:queue:v1`

## Производительность

Устранён feedback loop notification badge → reload → badge event → reload. Основной sticky topbar больше не использует постоянный `backdrop-filter`. Модальные окна используют непрозрачное/полупрозрачное затемнение без blur.

## Проверка

Проверка исходников Stage A16:
- JS/JSX: 307 файлов, 0 синтаксических ошибок через TypeScript transpileModule;
- relative imports: 615, missing 0;
- SCSS/CSS: 106 файлов, brace errors 0.

Полный production build не заявляется как проверенный: исходный архив по-прежнему содержит неполную/legacy сборочную конфигурацию.
