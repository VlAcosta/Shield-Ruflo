export const STRATEGY_STATS = Object.freeze([
  { value: 'SLA', label: 'приоритизация негативных событий', tone: 'amber' },
  { value: '1 inbox', label: 'единая очередь репутационных сигналов', tone: 'violet' },
  { value: 'AI', label: 'черновики и классификация причин', tone: 'green' },
  { value: 'Audit', label: 'история действий и согласований', tone: 'pink' },
]);

export const REPUTATION_LOOP = Object.freeze([
  { number: '01', title: 'Detect', text: 'Получаем review events из фактически подключённых источников и собираем их в единой очереди.', tone: 'violet' },
  { number: '02', title: 'Prioritize', text: 'Выделяем негатив, SLA, risk и overdue — команда видит, что требует реакции первым.', tone: 'purple' },
  { number: '03', title: 'Assist', text: 'AI помогает подготовить черновик, применить tone of voice и классифицировать вероятную причину.', tone: 'green' },
  { number: '04', title: 'Govern', text: 'Ответ проходит выбранную политику: самостоятельно, через согласование или управляемый workflow.', tone: 'pink' },
  { number: '05', title: 'Escalate', text: 'Сложный репутационный риск переводится в legal/case workflow с сохранением контекста.', tone: 'rose' },
  { number: '06', title: 'Operate', text: 'Негатив превращается во внутреннюю задачу: исправить причину, назначить владельца и проверить результат.', tone: 'orange' },
  { number: '07', title: 'Measure', text: 'Руководитель видит SLA, reply coverage, динамику рейтинга и повторяющиеся причины по локациям.', tone: 'blue' },
]);

export const CORE_CAPABILITIES = Object.freeze([
  { key: 'inbox', title: 'Unified Reviews Inbox', text: 'Одна очередь событий с фильтрами по статусу, площадке, рейтингу и локации.', icon: 'message' },
  { key: 'sla', title: 'SLA & Triage', text: 'Negative, risk и overdue состояния помогают не терять события, требующие быстрой реакции.', icon: 'bolt' },
  { key: 'ai', title: 'AI Reply Intelligence', text: 'Черновики ответов, tone of voice, sentiment и классификация причин — с человеком в контуре.', icon: 'sparkles' },
  { key: 'approval', title: 'Approval & Governance', text: 'Согласование ответов, роли, permissions и история решений для командного процесса.', icon: 'shield' },
  { key: 'tasks', title: 'Closed-loop Tasks', text: 'Связь review → task → результат превращает репутационный сигнал во внутреннее улучшение.', icon: 'check' },
  { key: 'analytics', title: 'Root-cause Analytics', text: 'Динамика рейтинга, покрытие ответами, SLA и повторяющиеся причины по площадкам и точкам.', icon: 'chart' },
  { key: 'reports', title: 'Executive Reports', text: 'Периодические отчёты показывают руководителю не количество экранов, а результат процесса.', icon: 'report' },
]);

export const PRODUCT_TRUTHS = Object.freeze([
  { title: 'Backend-enforced access', text: 'Организация, роль, permission и ресурсный контекст проверяются сервером, а не интерфейсом.', icon: 'shield' },
  { title: 'Capability-aware integrations', text: 'Read/reply/sync считаются доступными только после подтверждения production adapter.', icon: 'blocks' },
  { title: 'Auditable workflow', text: 'Ответы, согласования, задачи и ключевые изменения оставляют историю действий.', icon: 'check' },
  { title: 'Usage-based packaging', text: 'Тариф объясняется локациями, объёмом отзывов, AI и governance, а не скрытым ручным трудом.', icon: 'chart' },
]);

export const ICP_SEGMENTS = Object.freeze([
  {
    id: 'local',
    title: 'Локальный бизнес · 1–3 точки',
    priority: 'Основной сценарий',
    pain: 'Отзывы в картах теряются, негатив остаётся без ответа, выделенного reputation manager нет.',
    fit: 'Единый inbox, SLA, AI draft, QR-сбор и weekly digest.',
  },
  {
    id: 'network',
    title: 'Сети · 4–20 точек',
    priority: 'Основной сценарий',
    pain: 'Нужно сравнивать филиалы, контролировать SLA и согласовывать ответы команды.',
    fit: 'Location workflow, RBAC, approval, отчёты и root-cause comparison.',
  },
  {
    id: 'marketplace',
    title: 'Marketplace / e-commerce',
    priority: 'Второй wedge',
    pain: 'Большой объём отзывов и повторяющиеся причины негатива трудно обрабатывать вручную.',
    fit: 'AI classification, задачи, аналитика причин и управляемый reply workflow — там, где provider capability подтверждена.',
  },
]);

export const PRODUCT_KPIS = Object.freeze([
  { title: 'Resolved within SLA', text: 'Доля негативных репутационных событий, закрытых в целевой SLA.' },
  { title: 'First-response time', text: 'Медианное время до первого содержательного действия команды.' },
  { title: 'Reply coverage', text: 'Доля событий, где выбран и завершён необходимый response workflow.' },
  { title: 'Rating delta', text: 'Динамика рейтинга по локации и площадке за выбранный период.' },
]);

export const LANDING_PLAN_SUMMARY = Object.freeze([
  { id: 'START', name: 'Start', price: '3 490 ₽', scope: '1 точка', note: 'Единый inbox, базовый workflow, AI и weekly digest.' },
  { id: 'GROWTH', name: 'Growth', price: '8 990 ₽', scope: 'до 3 точек', note: 'SLA, intelligence, automation, competitors и reports.', recommended: true },
  { id: 'PRO', name: 'Pro', price: '18 990 ₽', scope: 'до 10 точек', note: 'Approval, advanced RBAC, audit, API/webhooks и team governance.' },
  { id: 'BUSINESS', name: 'Business', price: 'от 39 900 ₽', scope: '10–25+ точек', note: 'Multi-location/agency, custom governance, SLA и integration scope.' },
]);
