import fs from 'node:fs';

const path = 'backend/test/review-ingestion.integration.test.ts';
const source = fs.readFileSync(path, 'utf8');
const before = `  async function queueSync() {
    const response = await app.inject({
      method: 'POST',
      url: \`/api/v1/integrations/\${accountId}/sync\`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(202);
    return response.json().run as { id: string; status: string };
  }`;
const after = `  async function queueSync() {
    const response = await app.inject({
      method: 'POST',
      url: \`/api/v1/integrations/\${accountId}/sync\`,
      headers: { cookie },
    });
    if (response.statusCode !== 202) {
      throw new Error(\`P17 queue sync failed (\${response.statusCode}): \${response.body}\`);
    }
    return response.json().run as { id: string; status: string };
  }`;
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`Expected exactly one queueSync helper, found ${count}`);
fs.writeFileSync(path, source.replace(before, after));
