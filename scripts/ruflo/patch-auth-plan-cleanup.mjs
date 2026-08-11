import fs from 'node:fs';

const path = 'src/features/auth/AuthWorkspace.jsx';
let text = fs.readFileSync(path, 'utf8');

text = text.replace(
  "import React, { useEffect, useMemo, useRef, useState } from 'react';",
  "import React, { useEffect, useRef, useState } from 'react';",
);
text = text.replace('function AuthSide({ selectedPlan, invitation }) {', 'function AuthSide({ invitation }) {');

// Keep the protected invitation card, but remove unverified proof metrics from normal auth.
const proofPattern = /(\s*\{invitation \? \(\s*<div className="auth-v2__invite-side-card">[\s\S]*?<\/div>\s*\)) : \(\s*<div className="auth-v2__proof">[\s\S]*?<\/div>\s*\)\}/;
if (!proofPattern.test(text)) throw new Error('Auth side proof block anchor not found');
text = text.replace(proofPattern, '$1 : null}');

// The old pre-login tariff card was driven by localStorage and must not exist anymore.
text = text
  .split('\n')
  .filter((line) => !(line.includes('selectedPlan') && line.includes('auth-v2__plan')))
  .join('\n');

const selectedPlanMemo = /\n\s*const selectedPlan = useMemo\(\(\) => \{[\s\S]*?\n\s*\}, \[invitationMode\]\);\n/;
if (!selectedPlanMemo.test(text)) throw new Error('selectedPlan memo anchor not found');
text = text.replace(selectedPlanMemo, '\n');

text = text.replace(
  "authService.requestCode({ phone: fullPhone, mode: invitationMode ? 'register' : mode, planId: selectedPlan?.id, invitationToken: inviteToken || undefined })",
  "authService.requestCode({ phone: fullPhone, mode: invitationMode ? 'register' : mode, invitationToken: inviteToken || undefined })",
);
text = text.replace(
  "authService.register({ phone: fullPhone, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), plan: selectedPlan, invitationToken: inviteToken || undefined })",
  "authService.register({ phone: fullPhone, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), invitationToken: inviteToken || undefined })",
);
text = text.replace(
  "let user = result.user || { phone: fullPhone, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), plan: selectedPlan };",
  "let user = result.user || { phone: fullPhone, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() };",
);
text = text.replace('<AuthSide selectedPlan={selectedPlan} invitation={invitation} />', '<AuthSide invitation={invitation} />');
text = text.replace(/^\s*localStorage\.removeItem\(['"]selectedPlan['"]\);\s*\n/gm, '');

if (text.includes('selectedPlan')) throw new Error('Legacy selectedPlan references remain after patch');
if (text.includes('98%') || text.includes('10k+')) throw new Error('Unverified auth proof metrics remain after patch');

fs.writeFileSync(path, text);
console.log('Auth tariff/proof cleanup complete; tariff selection now belongs to post-onboarding billing.');
