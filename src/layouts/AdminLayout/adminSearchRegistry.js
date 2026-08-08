export const ADMIN_GLOBAL_SEARCH = Object.freeze([
  { id:'route-dashboard', title:'Дашборд', description:'Обзор системы и ключевые KPI', keywords:'главная выручка клиенты churn тикеты', to:'/admin/dashboard' },
  { id:'route-clients', title:'Клиенты', description:'CRM, компании, подписки и менеджеры', keywords:'клиенты компании инн crm', to:'/admin/clients' },
  { id:'route-subscriptions', title:'Подписки', description:'MRR, тарифы, продления и платежи', keywords:'биллинг mrr arr тариф оплата продление', to:'/admin/subscriptions' },
  { id:'route-managers', title:'Менеджеры', description:'Команда, загрузка и портфель клиентов', keywords:'команда менеджеры сотрудники рейтинг', to:'/admin/managers' },
  { id:'route-tickets', title:'Тикеты', description:'Очередь поддержки и SLA', keywords:'поддержка тикет helpdesk sla обращения', to:'/admin/tickets' },
  { id:'route-analytics', title:'Аналитика', description:'MRR, churn, ARPU и площадки', keywords:'аналитика метрики отчеты mrr churn arpu', to:'/admin/analytics' },
  { id:'route-settings', title:'Настройки', description:'Конфигурация Admin CRM', keywords:'настройки конфигурация тарифы smtp интеграции безопасность', to:'/admin/settings' },
  { id:'settings-integrations', title:'Интеграции', description:'Подключения Яндекс, 2GIS, Telegram и CRM', keywords:'интеграции yandex 2gis telegram google amo whatsapp', to:'/admin/settings?tab=integrations' },
  { id:'settings-security', title:'Безопасность', description:'PIN, сессии и аудит действий', keywords:'безопасность pin сессия лог аудит', to:'/admin/settings?tab=security' },
  { id:'settings-templates', title:'Шаблоны ответов', description:'Библиотека быстрых ответов', keywords:'шаблоны отзывы ответы', to:'/admin/settings?tab=templates' },
]);
