# Stage 16 — performance pass

## Найденные причины тормозов

1. `App.js` синхронно импортировал все страницы кабинета и все секции лендинга. В результате код Dashboard, Reports, Tasks, Profile, FAQ, Chat, Notifications и маркетингового сайта попадал в стартовый граф зависимостей независимо от открытого URL.
2. `scss/main.scss` глобально подключал стили всех десяти секций лендинга и весь legacy portal CSS. Только каталог `scss/portal` содержит около 103 KB исходного SCSS, а верхнеуровневые landing SCSS — ещё около 61 KB.
3. Два SVG на лендинге содержали встроенные растровые изображения и занимали около 31 MB вместе (`photo6_1.svg` и `phote6_2.svg`).
4. PortalLayout размонтировался и создавался заново при переходе между страницами, потому что каждая страница самостоятельно оборачивалась в `<PortalLayout>`.
5. На постоянно видимых поверхностях использовались многочисленные `backdrop-filter: blur(...)`, что увеличивает стоимость перерисовки при скролле, особенно на ноутбуках и устройствах со встроенной графикой.
6. Поиск, меню уведомлений, меню профиля и drawer отзывов загружались вместе с header, даже если пользователь их не открывал.

## Что изменено

- Route-level code splitting через `React.lazy` + `Suspense`.
- Один постоянный `PortalLayout` для всех страниц кабинета через nested routes + `<Outlet />`.
- Внутри PortalLayout отдельный skeleton при догрузке страницы: sidebar/header больше не исчезают при навигации.
- Prefetch страницы по `pointerenter`/`focus` на пунктах sidebar.
- Lazy loading поиска, меню уведомлений, меню профиля и drawer отзывов.
- `main.scss` оставлен только как лёгкий reset/base. Landing styles вынесены в отдельный `landing.scss` и загружаются только на `/`.
- Legacy portal stylesheet больше не находится в глобальном entry point. Для PortalLayout выделен компактный `PortalLayoutCore.scss` (~5.6 KB вместо ~81 KB legacy portal.scss в стартовом CSS-графе).
- Два 14–17 MB embedded-raster SVG заменены на оптимизированные WebP (примерно 62 KB и 36 KB).
- Ниже первого экрана изображения лендинга используют `loading="lazy"`, `decoding="async"` и низкий fetch priority.
- Убраны постоянные `backdrop-filter` с обычных feature surfaces и sticky header/sidebar. Blur оставлен только там, где он действительно нужен как overlay-эффект (PIN/command palette).
- Для длинных списков добавлен `content-visibility: auto` с intrinsic size.
- Scroll reveal и его IntersectionObserver теперь запускаются только на LandingPage, а не на каждой странице приложения.
- Добавлен delayed route loader: если chunk уже в кеше, loader не успевает мигнуть; при холодной загрузке пользователь видит понятное состояние вместо белого экрана.

## Статические результаты

- Размер каталога исходников: примерно 34 MB → 3.3 MB.
- Assets: 30.9 MB → 0.77 MB (около -97.5%).
- Eager imports страниц: все страницы → только текущий route chunk.
- Проверено 205 JS/JSX файлов TypeScript parser: синтаксических ошибок 0.
- Проверены относительные imports: отсутствующих imports 0.

## Что не удалось измерить из этого архива

В приложенном `src` лежит `package.json` только с зависимостью `git`; React, react-router, Sass и build scripts в нём отсутствуют. Поэтому production `npm run build`, bundle analyzer и Lighthouse на данном архиве воспроизвести нельзя. После подстановки этого `src` в реальный корень проекта рекомендуется выполнить production build и Lighthouse/Performance trace.
