import fs from 'node:fs';

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (before === after) throw new Error(`No changes made to ${path}`);
  fs.writeFileSync(path, after);
  console.log(`Patched ${path}`);
}

patch('src/services/subscriptions/subscriptionService.js', (text) => {
  const start = text.indexOf('export async function setSubscriptionAutoRenew(');
  const next = text.indexOf('export async function persistSubscriptionCart(', start);
  if (start < 0 || next < 0) throw new Error('subscriptionService auto-renew anchors not found');
  return text.slice(0, start) + text.slice(next);
});

patch('src/features/subscriptions/hooks/useSubscriptions.js', (text) => {
  text = text.replace('  setSubscriptionAutoRenew,\n', '');
  text = text.replace(
    "  const [busy, setBusy] = useState({ renewal: false, promo: false, checkout: false, trial: false });",
    "  const [busy, setBusy] = useState({ promo: false, checkout: false, trial: false });",
  );

  const start = text.indexOf('  const toggleAutoRenew = useCallback(');
  const next = text.indexOf('  const applyPromo = useCallback(', start);
  if (start < 0 || next < 0) throw new Error('useSubscriptions auto-renew anchors not found');
  text = text.slice(0, start) + text.slice(next);
  text = text.replace('    toggleAutoRenew,\n', '');

  if (text.includes('setSubscriptionAutoRenew') || text.includes('toggleAutoRenew') || text.includes('busy.renewal')) {
    throw new Error('Frontend auto-renew references remain');
  }
  return text;
});
