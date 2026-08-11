import fs from 'node:fs';

const path = 'src/features/auth/AuthWorkspace.jsx';
let text = fs.readFileSync(path, 'utf8');

text = text.replace(
  "import React, { useEffect, useMemo, useRef, useState } from 'react';",
  "import React, { useEffect, useRef, useState } from 'react';",
);
text = text.replace('function AuthSide({ selectedPlan, invitation }) {', 'function AuthSide({ invitation }) {');

const proofBlock = `      {invitation ? (\n        <div className="auth-v2__invite-side-card">\n          <span>Доступ в компанию</span>\n          <strong>{invitation.company?.title || 'Компания'}</strong>\n          <small>{getRoleLabel(invitation.role)}</small>\n          <i>Организация уже настроена владельцем</i>\n        </div>\n      ) : (\n        <div className="auth-v2__proof">\n          <div><strong>98%</strong><span>положительных результатов</span></div>\n          <div><strong>10k+</strong><span>обработанных отзывов</span></div>\n          <div><strong>24/7</strong><span>мониторинг и поддержка</span></div>\n        </div>\n      )}\n      {selectedPlan && !invitation ? <div className="auth-v2__plan"><span>Выбран тариф</span><strong>{selectedPlan.title || selectedPlan.name}</strong><small>{selectedPlan.total ? \`${Number(selectedPlan.total).toLocaleString('ru-RU')} ₽\` : 'Условия сохранены'}</small></div> : null}`;

const simplerSide = `      {invitation ? (\n        <div className="auth-v2__invite-side-card">\n          <span>Доступ в компанию</span>\n          <strong>{invitation.company?.title || 'Компания'}</strong>\n          <small>{getRoleLabel(invitation.role)}</small>\n          <i>Организация уже настроена владельцем</i>\n        </div>\n      ) : null}`;

if (!text.includes(proofBlock)) throw new Error('Auth side proof/plan block anchor not found');
text = text.replace(proofBlock, simplerSide);

const selectedPlanMemo = `  const selectedPlan = useMemo(() => {\n    if (invitationMode) return null;\n    try { return JSON.parse(localStorage.getItem('selectedPlan') || 'null'); } catch { return null; }\n  }, [invitationMode]);\n\n`;
if (!text.includes(selectedPlanMemo)) throw new Error('selectedPlan memo anchor not found');
text = text.replace(selectedPlanMemo, '');

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

fs.writeFileSync(path, text);
console.log('Auth plan selection removed; tariff selection now belongs to post-onboarding billing.');
