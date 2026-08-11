import {
  COMPANY_MEMBERSHIP_CHANGED_EVENT,
  readCurrentMembership,
} from '../profile/companyInvitationService';

export const RBAC_ROLES_KEY = 'business-shield:rbac-roles:v1';
export const RBAC_CHANGED_EVENT = 'business-shield:rbac-changed';

export const PERMISSION_GROUPS = Object.freeze([
  {
    id: 'workspace',
    label: 'Рабочее пространство',
    description: 'Главная доска и настройка виджетов',
    permissions: [
      { id: 'dashboard.view', label: 'Просматривать главную', description: 'Показатели, рейтинг, процессы и календарь' },
      { id: 'dashboard.edit', label: 'Настраивать доску', description: 'Добавлять, перемещать и скрывать виджеты' },
    ],
  },
  {
    id: 'business',
    label: 'Бизнесы и филиалы',
    description: 'Структура организации',
    permissions: [
      { id: 'business.view', label: 'Просматривать бизнесы', description: 'Видеть бизнесы организации' },
      { id: 'business.manage', label: 'Управлять бизнесами', description: 'Создавать и изменять бизнесы' },
      { id: 'locations.view', label: 'Просматривать филиалы', description: 'Видеть точки присутствия' },
      { id: 'locations.manage', label: 'Управлять филиалами', description: 'Создавать и изменять филиалы' },
      { id: 'analytics.view', label: 'Просматривать аналитику', description: 'Доступ к аналитике репутации' },
    ],
  },
  {
    id: 'reviews',
    label: 'Отзывы',
    description: 'Мониторинг и ответы клиентам',
    permissions: [
      { id: 'reviews.view', label: 'Просматривать отзывы', description: 'Список новых и обработанных отзывов' },
      { id: 'reviews.reply', label: 'Отвечать на отзывы', description: 'Отправлять ответы от лица компании' },
      { id: 'reviews.moderate', label: 'Менять статусы', description: 'Закрывать, возвращать и модерировать обращения' },
      { id: 'reviews.approve', label: 'Согласовывать ответы', description: 'Одобрять ответы перед публикацией и возвращать на доработку' },
      { id: 'reviews.legal', label: 'Юридическая эскалация', description: 'Передавать спорные отзывы на юридическую проверку' },
      { id: 'reviews.settings', label: 'Настраивать политику', description: 'Режим ответа, tone of voice и автоматизации организации' },
      { id: 'cases.view', label: 'Просматривать кейсы', description: 'Репутационные кейсы, SLA, причины и измеримые результаты' },
      { id: 'cases.manage', label: 'Управлять кейсами', description: 'Триаж, назначение, исполнение, решение и повторное открытие' },
      { id: 'cases.verify', label: 'Проверять результат кейсов', description: 'Верифицировать эффект и закрывать репутационные кейсы' },
    ],
  },
  {
    id: 'automations',
    label: 'Автоматизации',
    description: 'Правила реакции и эскалации',
    permissions: [
      { id: 'automations.view', label: 'Просматривать автоматизации', description: 'Сценарии и журнал выполнения' },
      { id: 'automations.manage', label: 'Управлять автоматизациями', description: 'Создавать, изменять и выключать правила' },
    ],
  },
  {
    id: 'integrations',
    label: 'Интеграции',
    description: 'Источники данных, синхронизация и диагностика',
    permissions: [
      { id: 'integrations.view', label: 'Просматривать интеграции', description: 'Статусы источников, журнал и диагностика' },
      { id: 'integrations.manage', label: 'Управлять интеграциями', description: 'Подключать, переподключать, синхронизировать и отключать источники' },
    ],
  },
  {
    id: 'tasks',
    label: 'Задачи',
    description: 'Командная работа и чек-листы',
    permissions: [
      { id: 'tasks.view', label: 'Просматривать задачи', description: 'Kanban, список, сроки и исполнители' },
      { id: 'tasks.manage', label: 'Управлять задачами', description: 'Создавать, изменять и завершать задачи' },
      { id: 'tasks.create', label: 'Создавать задачи', description: 'Новые задачи и пункты чек-листа' },
      { id: 'tasks.edit', label: 'Редактировать задачи', description: 'Статус, срок, исполнитель, комментарии' },
      { id: 'tasks.delete', label: 'Удалять задачи', description: 'Безвозвратное удаление рабочих задач' },
    ],
  },
  {
    id: 'reports',
    label: 'Отчёты',
    description: 'Аналитика и экспорт',
    permissions: [
      { id: 'reports.view', label: 'Просматривать отчёты', description: 'Готовые отчёты и показатели' },
      { id: 'reports.create', label: 'Создавать отчёты', description: 'Конструктор и расписание' },
      { id: 'reports.export', label: 'Скачивать отчёты', description: 'PDF и другие доступные форматы' },
    ],
  },
  {
    id: 'billing',
    label: 'Подписка и оплата',
    description: 'Тарифы, лимиты и история платежей',
    permissions: [
      { id: 'billing.view', label: 'Просматривать подписку', description: 'Текущий тариф, лимиты и платежи' },
      { id: 'billing.manage', label: 'Управлять подпиской', description: 'Покупать пакеты и менять тариф' },
    ],
  },
  {
    id: 'company',
    label: 'Компания',
    description: 'Реквизиты и настройки организации',
    permissions: [
      { id: 'company.view', label: 'Просматривать компанию', description: 'Реквизиты и данные организации' },
      { id: 'company.edit', label: 'Редактировать компанию', description: 'Менять реквизиты и профиль организации' },
    ],
  },
  {
    id: 'team',
    label: 'Команда и доступ',
    description: 'Участники, роли и безопасность',
    permissions: [
      { id: 'team.view', label: 'Просматривать команду', description: 'Состав, роли, статусы и активность' },
      { id: 'team.manage', label: 'Управлять командой', description: 'Приглашать и изменять участников' },
      { id: 'team.invite', label: 'Приглашать пользователей', description: 'Создавать персональные ссылки доступа' },
      { id: 'team.manage_roles', label: 'Управлять ролями', description: 'Назначать права и создавать свои роли' },
      { id: 'team.manage_security', label: 'Управлять безопасностью', description: 'Замораживать доступ, управлять сессиями и сроком доступа' },
      { id: 'team.remove', label: 'Удалять пользователей', description: 'Отзывать доступ участников' },
    ],
  },
  {
    id: 'support',
    label: 'Поддержка',
    description: 'Связь с командой Бизнес Щит',
    permissions: [
      { id: 'support.view', label: 'Просматривать поддержку', description: 'FAQ, история и доступные каналы' },
      { id: 'support.write', label: 'Писать в поддержку', description: 'Создавать сообщения и обращения' },
    ],
  },
]);

export const ALL_PERMISSIONS = Object.freeze(
  PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => permission.id)),
);

const readOnlyPermissions = [
  'dashboard.view',
  'business.view',
  'locations.view',
  'reviews.view',
  'cases.view',
  'automations.view',
  'integrations.view',
  'analytics.view',
  'tasks.view',
  'reports.view',
  'billing.view',
  'company.view',
  'team.view',
  'support.view',
];

export const PRESET_ROLES = Object.freeze([
  {
    id: 'OWNER',
    label: 'Владелец',
    description: 'Полный доступ без ограничений. Роль владельца нельзя удалить.',
    tone: 'violet',
    system: true,
    permissions: ALL_PERMISSIONS,
  },
  {
    id: 'ADMIN',
    label: 'Администратор',
    description: 'Управляет компанией, командой и всеми рабочими разделами.',
    tone: 'indigo',
    system: true,
    permissions: ALL_PERMISSIONS.filter((permission) => permission !== 'billing.manage'),
  },
  {
    id: 'MANAGER',
    label: 'Менеджер',
    description: 'Работает с отзывами, задачами, отчётами и поддержкой без административных настроек.',
    tone: 'purple',
    system: true,
    permissions: [
      'dashboard.view', 'dashboard.edit',
      'business.view', 'business.manage', 'locations.view', 'locations.manage',
      'reviews.view', 'reviews.reply', 'reviews.moderate', 'reviews.legal',
      'cases.view', 'cases.manage', 'cases.verify',
      'automations.view',
      'integrations.view',
      'analytics.view',
      'tasks.view', 'tasks.manage', 'tasks.create', 'tasks.edit',
      'reports.view', 'reports.create', 'reports.export',
      'billing.view',
      'company.view',
      'team.view',
      'support.view', 'support.write',
    ],
  },
  {
    id: 'ANALYST',
    label: 'Аналитик',
    description: 'Безопасный режим чтения: можно смотреть данные, но нельзя менять рабочее пространство.',
    tone: 'amber',
    system: true,
    permissions: readOnlyPermissions,
  },
  {
    id: 'MEMBER',
    label: 'Участник',
    description: 'Работает с отзывами и задачами без административного доступа.',
    tone: 'cyan',
    system: true,
    permissions: ['dashboard.view', 'business.view', 'locations.view', 'reviews.view', 'reviews.reply', 'cases.view', 'tasks.view', 'tasks.create', 'tasks.edit', 'integrations.view', 'automations.view', 'reports.view', 'company.view', 'team.view', 'support.view', 'support.write'],
  },
]);

const LEGACY_ROLE_IDS = Object.freeze({
  owner: 'OWNER',
  admin: 'ADMIN',
  moderator: 'MANAGER',
  guest: 'ANALYST',
  member: 'MEMBER',
});

function normalizeRoleId(roleId) {
  const raw = String(roleId || 'MEMBER').trim();
  const standard = ['OWNER', 'ADMIN', 'MANAGER', 'ANALYST', 'MEMBER'];
  const upper = raw.toUpperCase();
  return LEGACY_ROLE_IDS[raw.toLowerCase()] || (standard.includes(upper) ? upper : raw);
}

function resolveMembershipRoleId(membership) {
  const canonicalRole = String(membership?.role || '').toUpperCase();
  if (['OWNER', 'ADMIN', 'MANAGER', 'ANALYST', 'MEMBER'].includes(canonicalRole)) return canonicalRole;
  return normalizeRoleId(membership?.accessRoleId || membership?.role || 'MEMBER');
}

const ROUTE_PERMISSIONS = Object.freeze([
  { prefix: '/dashboard', permission: 'dashboard.view' },
  { prefix: '/reviews', permission: 'reviews.view' },
  { prefix: '/reputation', permission: 'analytics.view' },
  { prefix: '/cases', permission: 'cases.view' },
  { prefix: '/automations', permission: 'automations.view' },
  { prefix: '/integrations', permission: 'integrations.view' },
  { prefix: '/subscriptions', permission: 'billing.view' },
  { prefix: '/reports', permission: 'reports.view' },
  { prefix: '/tasks', permission: 'tasks.view' },
  { prefix: '/chat', permission: 'support.view' },
  { prefix: '/faq', permission: 'support.view' },
  { prefix: '/knowledge-base', permission: 'support.view' },
]);

const clone = (value) => JSON.parse(JSON.stringify(value));

function normalizeRole(role = {}) {
  const permissions = Array.from(new Set(
    (Array.isArray(role.permissions) ? role.permissions : [])
      .filter((permission) => ALL_PERMISSIONS.includes(permission)),
  ));
  return {
    id: role.id || `custom-${Date.now().toString(36)}`,
    label: String(role.label || role.name || 'Своя роль').trim().slice(0, 44),
    description: String(role.description || '').trim().slice(0, 180),
    tone: role.tone || 'cyan',
    system: Boolean(role.system),
    permissions,
    createdAt: role.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function readCustomRoles() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(RBAC_ROLES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeRole) : [];
  } catch {
    return [];
  }
}

function writeCustomRoles(roles) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RBAC_ROLES_KEY, JSON.stringify(roles));
  window.dispatchEvent(new CustomEvent(RBAC_CHANGED_EVENT, { detail: { roles: clone(roles) } }));
}

export function getAvailableRoles() {
  return [...PRESET_ROLES, ...readCustomRoles()];
}

export function getRoleById(roleId) {
  const normalizedId = normalizeRoleId(roleId);
  return getAvailableRoles().find((role) => role.id === normalizedId)
    || PRESET_ROLES.find((role) => role.id === 'MEMBER');
}

export function getRoleLabel(roleId) {
  return getRoleById(roleId)?.label || roleId || 'Пользователь';
}

export function createCustomRole(payload) {
  const current = readCustomRoles();
  const role = normalizeRole({
    ...payload,
    id: payload.id || `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    system: false,
  });
  writeCustomRoles([role, ...current.filter((item) => item.id !== role.id)]);
  return clone(role);
}

export function updateCustomRole(roleId, patch) {
  const current = readCustomRoles();
  const index = current.findIndex((role) => role.id === roleId);
  if (index < 0) throw new Error('Роль не найдена');
  const nextRole = normalizeRole({ ...current[index], ...patch, id: roleId, system: false });
  const next = current.map((role, roleIndex) => roleIndex === index ? nextRole : role);
  writeCustomRoles(next);
  return clone(nextRole);
}

export function deleteCustomRole(roleId) {
  if (!String(roleId || '').startsWith('custom-')) throw new Error('Системную роль удалить нельзя');
  const current = readCustomRoles();
  const next = current.filter((role) => role.id !== roleId);
  writeCustomRoles(next);
  return next.length !== current.length;
}

export function resolvePermissions(roleId, overrides = {}) {
  const role = getRoleById(normalizeRoleId(roleId));
  const allowed = new Set(role?.permissions || []);
  (overrides.allow || []).forEach((permission) => {
    if (ALL_PERMISSIONS.includes(permission)) allowed.add(permission);
  });
  (overrides.deny || []).forEach((permission) => allowed.delete(permission));
  return Array.from(allowed);
}

export function getCurrentAccessContext(membership = readCurrentMembership()) {
  const roleId = resolveMembershipRoleId(membership);
  const overrides = membership?.permissionOverrides || {};
  const role = getRoleById(roleId);
  const hasServerOrganizationContext = Boolean(
    membership?.organizationId || membership?.organization?.id,
  );
  const serverPermissions = Array.isArray(membership?.permissions)
    ? membership.permissions.filter((permission) => ALL_PERMISSIONS.includes(permission))
    : null;
  // An authenticated organization membership must never gain client-preset
  // permissions when the server contract is incomplete or malformed. Legacy
  // local role previews have no organization context and retain their fallback.
  const permissions = serverPermissions
    || (hasServerOrganizationContext ? [] : resolvePermissions(roleId, overrides));
  return {
    roleId,
    role,
    membership,
    permissions,
    permissionSet: new Set(permissions),
    overrides,
    isOwner: roleId === 'OWNER',
  };
}

export function hasPermission(permission, context = getCurrentAccessContext()) {
  if (!permission) return true;
  return context.permissionSet instanceof Set
    ? context.permissionSet.has(permission)
    : (context.permissions || []).includes(permission);
}

export function getRoutePermission(pathname = '') {
  return ROUTE_PERMISSIONS.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`))?.permission || null;
}

export function findFirstAllowedRoute(context = getCurrentAccessContext()) {
  const candidates = [
    ['/dashboard', 'dashboard.view'],
    ['/reviews', 'reviews.view'],
    ['/reputation', 'analytics.view'],
    ['/automations', 'automations.view'],
    ['/tasks', 'tasks.view'],
    ['/reports', 'reports.view'],
    ['/subscriptions', 'billing.view'],
    ['/profile', null],
    ['/chat', 'support.view'],
  ];
  return candidates.find(([, permission]) => !permission || hasPermission(permission, context))?.[0] || '/profile';
}

export function permissionsForMember(user = {}) {
  return resolvePermissions(user.accessRoleId || user.role || 'guest', user.permissionOverrides || {});
}

export function permissionStateForMember(user, permissionId) {
  const overrides = user?.permissionOverrides || {};
  if ((overrides.allow || []).includes(permissionId)) return 'allow';
  if ((overrides.deny || []).includes(permissionId)) return 'deny';
  return 'inherit';
}

export function buildPermissionOverride(user, permissionId, nextState) {
  const current = user?.permissionOverrides || {};
  const allow = new Set(current.allow || []);
  const deny = new Set(current.deny || []);
  allow.delete(permissionId);
  deny.delete(permissionId);
  if (nextState === 'allow') allow.add(permissionId);
  if (nextState === 'deny') deny.add(permissionId);
  return { allow: Array.from(allow), deny: Array.from(deny) };
}

if (typeof window !== 'undefined') {
  window.addEventListener(COMPANY_MEMBERSHIP_CHANGED_EVENT, () => {
    window.dispatchEvent(new CustomEvent(RBAC_CHANGED_EVENT));
  });
}
