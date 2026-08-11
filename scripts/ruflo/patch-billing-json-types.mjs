import fs from 'node:fs';

const path = 'backend/src/modules/billing/billing.checkout.ts';
let text = fs.readFileSync(path, 'utf8');

const replacements = [
  ['        checkoutPayload: quote.payload,', '        checkoutPayload: JSON.parse(JSON.stringify(quote.payload)),'],
  ['      payload: notification,', '      payload: JSON.parse(JSON.stringify(notification)),'],
];

for (const [before, after] of replacements) {
  if (!text.includes(before)) throw new Error(`Billing JSON anchor not found: ${before}`);
  text = text.replace(before, after);
}

fs.writeFileSync(path, text);
console.log('Normalized billing JSON payloads before Prisma persistence.');
