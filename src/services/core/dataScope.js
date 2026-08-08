function safeJson(key) {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

function sanitize(value) {
  return String(value || 'default')
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9@._+-]+/gi, '-')
    .slice(0, 96) || 'default';
}

export function getCompanyScope() {
  if (typeof window === 'undefined') return 'company-default';
  const membership = safeJson('business-shield:company-membership:v1');
  const currentUser = safeJson('currentUser');
  const organization = safeJson('organization');
  const company = membership?.company || currentUser?.membership?.company || {};
  const identifier = company.id || company.companyId || company.inn || organization?.inn || company.title || organization?.title || 'default';
  return `company-${sanitize(identifier)}`;
}

export function getAccountScope() {
  if (typeof window === 'undefined') return 'account-default';
  const currentUser = safeJson('currentUser');
  const membership = safeJson('business-shield:company-membership:v1');
  const identifier = currentUser?.id || currentUser?.userId || currentUser?.phone || currentUser?.email || membership?.userId || membership?.email || 'default';
  return `account-${sanitize(identifier)}`;
}

export function scopedStorageKey(baseKey, scope) {
  return `${baseKey}:${scope || getCompanyScope()}`;
}

export function readScopedJson(baseKey, { scope, legacy = true, fallback = null } = {}) {
  if (typeof window === 'undefined') return fallback;
  const resolvedScope = scope || getCompanyScope();
  const key = scopedStorageKey(baseKey, resolvedScope);
  const migrationOwnerKey = `${baseKey}:legacy-owner:v1`;

  try {
    const scopedRaw = localStorage.getItem(key);
    if (scopedRaw) return JSON.parse(scopedRaw);

    if (legacy) {
      const legacyRaw = localStorage.getItem(baseKey);
      const legacyOwner = localStorage.getItem(migrationOwnerKey);

      // A legacy global cache is claimed only once. Without this guard a second
      // account/company on the same browser could accidentally inherit data
      // that belonged to the first workspace.
      if (legacyRaw && (!legacyOwner || legacyOwner === resolvedScope)) {
        const parsed = JSON.parse(legacyRaw);
        localStorage.setItem(key, JSON.stringify(parsed));
        localStorage.setItem(migrationOwnerKey, resolvedScope);
        return parsed;
      }
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function writeScopedJson(baseKey, value, { scope } = {}) {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(scopedStorageKey(baseKey, scope), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeScopedValue(baseKey, { scope } = {}) {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(scopedStorageKey(baseKey, scope)); } catch { /* noop */ }
}
