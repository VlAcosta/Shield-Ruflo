import fs from 'node:fs';

const path = 'src/services/profile/profileService.js';
let text = fs.readFileSync(path, 'utf8');

const constantBefore = "const PROFILE_ENDPOINT = String(getRuntimeEnv('PROFILE_ENDPOINT', getRuntimeEnv('API_BASE', '/api/v1'))).replace(/\\/$/, '');";
const constantAfter = "const PROFILE_ENDPOINT = String(getRuntimeEnv('PROFILE_ENDPOINT', '/api/v1/profile')).replace(/\\/$/, '');\nconst COMPANY_PROFILE_ENDPOINT = String(getRuntimeEnv('COMPANY_PROFILE_ENDPOINT', '/api/v1/company/profile')).replace(/\\/$/, '');";
if (!text.includes(constantAfter)) {
  if (!text.includes(constantBefore)) throw new Error('PROFILE_ENDPOINT anchor not found');
  text = text.replace(constantBefore, constantAfter);
}

const requestBefore = `async function request(path = '', options = {}) {\n  if (!PROFILE_ENDPOINT) return null;\n  return apiRequest(joinEndpoint(PROFILE_ENDPOINT, path), { ...options, timeout: 9000 });\n}\n`;
const requestAfter = `${requestBefore}\nasync function companyRequest(options = {}) {\n  if (!COMPANY_PROFILE_ENDPOINT) return null;\n  return apiRequest(COMPANY_PROFILE_ENDPOINT, { ...options, timeout: 9000 });\n}\n`;
if (!text.includes('async function companyRequest(')) {
  if (!text.includes(requestBefore)) throw new Error('request helper anchor not found');
  text = text.replace(requestBefore, requestAfter);
}

const getStart = text.indexOf('export async function getProfileSnapshot({ signal } = {}) {');
const savePersonalStart = text.indexOf('export async function savePersonalProfile(', getStart);
if (getStart < 0 || savePersonalStart < 0) throw new Error('profile snapshot function anchors not found');
const getReplacement = `export async function getProfileSnapshot({ signal } = {}) {\n  try {\n    const remote = await request('', { signal });\n    if (!remote) throw new Error('PROFILE_API_UNAVAILABLE');\n    const snapshot = normalizeSnapshot(remote.snapshot || remote);\n    writeCache(snapshot, { emit: false });\n    mirrorPersonalToCurrentUser(snapshot.personal);\n    if (snapshot.company?.title) writeOrganizationMirror(snapshot.company);\n    return snapshot;\n  } catch (error) {\n    if (error?.name === 'AbortError') throw error;\n    const cached = readCache();\n    if (cached) return { ...normalizeSnapshot(cached), stale: true };\n    throw error;\n  }\n}\n\n`;
text = text.slice(0, getStart) + getReplacement + text.slice(savePersonalStart);

text = text.replace(
  `  const remote = await request('/company/profile', {\n    method: 'PATCH',\n    body: JSON.stringify(company),\n  });`,
  `  const remote = await companyRequest({\n    method: 'PATCH',\n    body: JSON.stringify(company),\n  });`,
);

text = text.replace(
  `    const remote = await request('/company/profile', {\n      method: 'PATCH',\n      body: JSON.stringify(company),\n    });`,
  `    const remote = await companyRequest({\n      method: 'PATCH',\n      body: JSON.stringify(company),\n    });`,
);

const pinStart = text.indexOf('export async function changeProfilePin({ currentPin, newPin }) {');
const revokeStart = text.indexOf('export async function revokeProfileSession(', pinStart);
if (pinStart < 0 || revokeStart < 0) throw new Error('PIN function anchors not found');
const pinReplacement = `export async function changeProfilePin({ currentPin, newPin }) {\n  const savedPin = localStorage.getItem(PIN_CODE_KEY) || '';\n  if (!savedPin || savedPin !== currentPin) {\n    const error = new Error('Текущий PIN указан неверно');\n    error.code = 'INVALID_PIN';\n    throw error;\n  }\n\n  localStorage.setItem(PIN_CODE_KEY, newPin);\n  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT));\n  recordCompanyActivity({ type: 'security_pin_changed', title: 'Изменён PIN-код', detail: 'Локальная защита кабинета обновлена', tone: 'success' });\n  return { success: true, storage: 'local' };\n}\n\n`;
text = text.slice(0, pinStart) + pinReplacement + text.slice(revokeStart);

if (text.includes("request('/company/profile'")) throw new Error('Legacy company request remains');
if (text.includes("request('/security/pin'")) throw new Error('Legacy PIN API request remains');

fs.writeFileSync(path, text);
console.log('Profile frontend now uses the canonical backend profile contract; PIN remains local-only.');
