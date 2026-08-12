import fs from 'node:fs';

function patchFile(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (before === after) {
    console.log(`No change: ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`Patched: ${path}`);
}

patchFile('backend/src/modules/billing/billing.checkout.ts', (text) => {
  const before = `    await tx.subscription.updateMany({\n      where: { organizationId: payment.organizationId, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },\n      data: { status: 'CANCELED', autoRenew: false },\n    });\n\n    const now = new Date();\n    const subscription = await tx.subscription.create({\n      data: {\n        organizationId: payment.organizationId,\n        planId: plan.id,\n        status: 'ACTIVE',\n        provider: payment.provider,\n        currentPeriodStart: now,\n        currentPeriodEnd: new Date(now.getTime() + BILLING_PERIOD_MS),\n        autoRenew: false,\n      },\n    });`;
  const after = `    await tx.$executeRaw\`SELECT pg_advisory_xact_lock(hashtextextended(\${\`billing:subscription:\${payment.organizationId}\`}, 0))\`;\n    const now = new Date();\n    const current = await tx.subscription.findFirst({\n      where: { organizationId: payment.organizationId, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },\n      orderBy: { createdAt: 'desc' },\n    });\n\n    let subscription;\n    if (current?.planId === plan.id) {\n      const baseEnd = current.currentPeriodEnd && current.currentPeriodEnd > now ? current.currentPeriodEnd : now;\n      await tx.subscription.updateMany({\n        where: {\n          organizationId: payment.organizationId,\n          status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },\n          id: { not: current.id },\n        },\n        data: { status: 'CANCELED', autoRenew: false },\n      });\n      subscription = await tx.subscription.update({\n        where: { id: current.id },\n        data: {\n          status: 'ACTIVE',\n          provider: payment.provider,\n          currentPeriodStart: current.currentPeriodStart ?? now,\n          currentPeriodEnd: new Date(baseEnd.getTime() + BILLING_PERIOD_MS),\n          autoRenew: false,\n        },\n      });\n    } else {\n      await tx.subscription.updateMany({\n        where: { organizationId: payment.organizationId, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },\n        data: { status: 'CANCELED', autoRenew: false },\n      });\n      subscription = await tx.subscription.create({\n        data: {\n          organizationId: payment.organizationId,\n          planId: plan.id,\n          status: 'ACTIVE',\n          provider: payment.provider,\n          currentPeriodStart: now,\n          currentPeriodEnd: new Date(now.getTime() + BILLING_PERIOD_MS),\n          autoRenew: false,\n        },\n      });\n    }`;
  if (text.includes('billing:subscription:${payment.organizationId}')) return text;
  if (!text.includes(before)) throw new Error('Billing activation anchor not found');
  return text.replace(before, after);
});

patchFile('src/features/subscriptions/SubscriptionsWorkspace/SubscriptionsWorkspace.jsx', (text) => {
  const before = `              const canPay = item.code === 'PRO' && !current && paymentProviderConfigured;`;
  const after = `              const canPay = item.code === 'PRO' && paymentProviderConfigured;`;
  if (!text.includes(before) && !text.includes(after)) throw new Error('PRO checkout anchor not found');
  text = text.replace(before, after);

  const buttonBefore = `{subscription.busy.checkout ? 'Создаём платёж…' : \`Оплатить PRO · \${formatCurrency(item.price)}\`}`;
  const buttonAfter = `{subscription.busy.checkout ? 'Создаём платёж…' : (current ? \`Продлить PRO на 1 месяц · \${formatCurrency(item.price)}\` : \`Оплатить PRO · \${formatCurrency(item.price)}\`)}`;
  if (!text.includes(buttonBefore) && !text.includes(buttonAfter)) throw new Error('PRO button copy anchor not found');
  return text.replace(buttonBefore, buttonAfter);
});

patchFile('backend/test/billing-checkout.integration.test.ts', (text) => {
  if (text.includes("extends the current PRO period instead of replacing it")) return text;
  const anchor = `  it('creates a tenant-owned hidden plan for a paid constructor configuration', async () => {`;
  if (!text.includes(anchor)) throw new Error('Billing renewal test anchor not found');
  const test = `  it('extends the current PRO period instead of replacing it', async () => {\n    immediateSuccess = true;\n    const before = await app.prisma.subscription.findFirstOrThrow({\n      where: { organizationId, status: 'ACTIVE' },\n      include: { plan: true },\n    });\n    expect(before.plan.code).toBe('PRO');\n    expect(before.currentPeriodEnd).toBeTruthy();\n\n    const response = await app.inject({\n      method: 'POST',\n      url: '/api/v1/billing/subscription/checkout',\n      headers: { cookie, 'idempotency-key': \`billing-renew-\${randomUUID()}\` },\n      payload: { kind: 'plan', planCode: 'PRO' },\n    });\n    expect(response.statusCode).toBe(200);\n    expect(response.json().status).toBe('succeeded');\n\n    const after = await app.prisma.subscription.findMany({\n      where: { organizationId, status: 'ACTIVE' },\n      include: { plan: true },\n    });\n    expect(after).toHaveLength(1);\n    expect(after[0]?.id).toBe(before.id);\n    expect(after[0]?.plan.code).toBe('PRO');\n    expect(after[0]?.currentPeriodEnd?.getTime()).toBe((before.currentPeriodEnd?.getTime() ?? 0) + 30 * 24 * 60 * 60 * 1000);\n  });\n\n`;
  return text.replace(anchor, `${test}${anchor}`);
});
