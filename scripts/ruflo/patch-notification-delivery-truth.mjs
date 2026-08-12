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

patchFile('backend/src/modules/operations/operations.routes.ts', (text) => {
  const before = `  app.patch('/notifications/settings', { preHandler: [app.authenticate] }, async (request) => {\n    const { userId } = authContext(request);\n    const settings = notificationPreferencesSchema.parse(request.body);\n    return { settings: await updateNotificationConfig(userId, 'settings', settings) };\n  });`;
  const after = `  app.patch('/notifications/settings', { preHandler: [app.authenticate] }, async (request) => {\n    authContext(request);\n    const settings = notificationPreferencesSchema.parse(request.body);\n    if (Object.keys(settings).length > 0) {\n      throw new AppError({\n        code: 'NOTIFICATION_DELIVERY_NOT_CONFIGURED',\n        message: 'Внешние каналы уведомлений и тихие часы пока не подключены',\n        statusCode: 422,\n        details: { inApp: true, externalDeliveryConfigured: false, quietHoursConfigured: false },\n      });\n    }\n    return { settings: {} };\n  });`;
  if (text.includes('NOTIFICATION_DELIVERY_NOT_CONFIGURED')) return text;
  if (!text.includes(before)) throw new Error('Notification settings route anchor not found');
  return text.replace(before, after);
});

patchFile('backend/test/operations-p10.integration.test.ts', (text) => {
  if (text.includes("rejects fake external notification delivery settings")) return text;
  const anchor = `  it('keeps notifications tenant and recipient scoped', async () => {`;
  if (!text.includes(anchor)) throw new Error('Notification integration test anchor not found');
  const test = `  it('rejects fake external notification delivery settings', async () => {\n    const response = await app.inject({\n      method: 'PATCH',\n      url: '/api/v1/notifications/settings',\n      headers: { cookie: ownerCookie },\n      payload: { channels: { email: true, telegram: true }, quietHours: { enabled: true, from: '22:00', to: '09:00' } },\n    });\n    expect(response.statusCode).toBe(422);\n    expect(response.json()).toMatchObject({\n      error: {\n        code: 'NOTIFICATION_DELIVERY_NOT_CONFIGURED',\n        details: { inApp: true, externalDeliveryConfigured: false, quietHoursConfigured: false },\n      },\n    });\n    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: ownerAId }, select: { notificationPreferences: true } });\n    expect(JSON.stringify(user.notificationPreferences ?? {})).not.toContain('telegram');\n  });\n\n`;
  return text.replace(anchor, `${test}${anchor}`);
});
