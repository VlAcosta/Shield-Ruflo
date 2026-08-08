# Stage A27.1 — Sidebar Appearance + Dark Theme Refinement

## Что изменено

- Быстрый переключатель светлой/тёмной темы перенесён из Dashboard в нижнюю часть левого sidebar.
- Полная настройка `Светлая / Тёмная / Системная` по-прежнему доступна в `Профиль → Оформление` и по ссылке `Настроить` под переключателем.
- Dashboard больше не содержит собственного контроллера темы; он только отображается в текущем глобальном appearance-mode.
- Sidebar navigation получил независимую прокрутку, поэтому переключатель темы остаётся доступным даже при большом количестве разделов.
- Тёмная тема доработана для shell-компонентов, которые раньше могли оставаться светлыми:
  - profile popover;
  - command palette;
  - PIN overlay и PIN keypad;
  - быстрый reviews drawer;
  - sidebar active/hover hierarchy;
  - новый sidebar appearance-control.
- В dark mode убран blur у command palette backdrop; используются обычные полупрозрачные поверхности и тени.
- Все новые motion-переходы учитывают `prefers-reduced-motion`.

## Поведение быстрого переключателя

- Светлая → Тёмная.
- Тёмная → Светлая.
- Если выбран режим `Системная`, sidebar показывает текущую реально разрешённую тему. Нажатие делает явный выбор противоположной темы; вернуться в `Системная` можно через Appearance Center.
- Preference остаётся account-scoped и синхронизируется с остальным кабинетом через существующий `APPEARANCE_EVENT`.

## QA

- TypeScript transpile check всех JS/JSX: 0 syntax errors.
- Relative imports: 0 missing.
- SCSS/CSS brace check: 0 errors.
