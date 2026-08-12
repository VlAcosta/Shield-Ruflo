import fs from 'node:fs';

const path = 'src/services/profile/profileService.js';
let text = fs.readFileSync(path, 'utf8');

const start = text.indexOf('function overlayCurrentUserPersonal(personal) {');
if (start >= 0) {
  const next = text.indexOf('\nfunction readLegacyOrganization()', start);
  if (next < 0) throw new Error('overlay helper end anchor not found');
  text = text.slice(0, start) + text.slice(next + 1);
}

text = text.replace(
  "export async function syncProfileCompanyFromOnboarding(company) {\n  if (!PROFILE_ENDPOINT) return;",
  "export async function syncProfileCompanyFromOnboarding(company) {\n  if (!COMPANY_PROFILE_ENDPOINT) return;",
);

fs.writeFileSync(path, text);
console.log('Removed legacy profile overlay and aligned company sync guard.');
