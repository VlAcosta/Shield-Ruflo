import fs from 'node:fs';

const path = 'src/services/profile/profileService.js';
let text = fs.readFileSync(path, 'utf8');
const start = text.indexOf('function overlayCurrentUserPersonal(snapshot) {');
if (start < 0) throw new Error('overlayCurrentUserPersonal(snapshot) not found');
const next = text.indexOf('\nfunction mirrorPersonalToCurrentUser(', start);
if (next < 0) throw new Error('mirrorPersonalToCurrentUser anchor not found');
text = text.slice(0, start) + text.slice(next + 1);
fs.writeFileSync(path, text);
console.log('Removed obsolete currentUser overlay from server-authoritative profile snapshot.');
