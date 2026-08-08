# Stage A23 — Reputation Intelligence

Добавлен `/reputation`: аналитика объясняет изменение репутации, а не просто показывает графики.

## Ключевые блоки

- Reputation Health 0–100.
- Rating / negative share / response coverage / average response time.
- Сравнение текущего и предыдущего периода: 7 / 30 / 90 дней.
- Динамика рейтинга.
- Матрица Яндекс / 2GIS / Ozon / Отзовик / WB.
- Причины негатива и их momentum.
- Smart Insights с объяснением причин изменений.
- Next Best Action с переходом в Automation Engine.

В production рекомендуется отдавать агрегированный snapshot через `REACT_APP_REPUTATION_ANALYTICS_ENDPOINT`. Пока endpoint отсутствует, аналитика строится из reviews data layer. Demo-history используется только при включённых demo-data и недостаточной локальной истории.
