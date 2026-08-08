const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const DB_PATH = path.join(__dirname, '..', 'db', 'auth-db.json');
const CODE_TTL_SECONDS = Number(process.env.AUTH_CODE_TTL_SECONDS || 60);
const STUB_AUTH_CODE = String(process.env.AUTH_STUB_CODE || '').replace(/\D/g, '').slice(0, 4);
const EGRUL_BASE_URL = 'https://egrul.nalog.ru';

function createAuthCode() {
  if (STUB_AUTH_CODE.length === 4) return STUB_AUTH_CODE;
  return String(Math.floor(1000 + Math.random() * 9000));
}

function isCodeExpired(session) {
  return Date.now() - Number(session.created_at || 0) > CODE_TTL_SECONDS * 1000;
}

function sendAuthCodeStub({ phone, code, session_id }) {
  const delivery = {
    provider: 'stub',
    status: 'sent',
    phone,
    code,
    session_id,
    ttl: CODE_TTL_SECONDS,
  };

  console.log(`[auth:stub] code ${code} for ${phone}, session ${session_id}`);
  return delivery;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEgrulRow(row) {
  return {
    source: 'egrul.nalog.ru',
    type: row.k === 'ip' ? 'ip' : 'ul',
    title: row.n || row.c || '',
    shortTitle: row.c || row.n || '',
    inn: row.i || '',
    kpp: row.p || '',
    ogrn: row.o || '',
    region: row.rn || '',
    registrationDate: row.r || '',
  };
}

async function lookupCompanyByInn(inn) {
  if (typeof fetch !== 'function') {
    throw new Error('Fetch API is not available in this Node.js runtime');
  }

  const searchParams = new URLSearchParams({ query: inn });
  const tokenResponse = await fetch(`${EGRUL_BASE_URL}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 BusinessShieldOnboarding/1.0',
      Referer: `${EGRUL_BASE_URL}/index.html`,
    },
    body: searchParams.toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error('EGRUL search request failed');
  }

  const tokenPayload = await tokenResponse.json();
  if (tokenPayload.captchaRequired) {
    throw new Error('EGRUL captcha required');
  }

  if (!tokenPayload.t) {
    throw new Error('EGRUL search token not found');
  }

  await wait(700);

  const resultResponse = await fetch(`${EGRUL_BASE_URL}/search-result/${tokenPayload.t}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 BusinessShieldOnboarding/1.0',
      Referer: `${EGRUL_BASE_URL}/index.html`,
    },
  });

  if (!resultResponse.ok) {
    throw new Error('EGRUL result request failed');
  }

  const resultPayload = await resultResponse.json();
  const row = Array.isArray(resultPayload.rows) ? resultPayload.rows[0] : null;

  if (!row) return null;
  return normalizeEgrulRow(row);
}

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ sessions: [], users: [] }, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDb(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }
function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
  if (req.method !== 'POST') return send(res, 404, { error: 'Not found' });

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    let data = {};
    try { data = body ? JSON.parse(body) : {}; } catch { return send(res, 400, { error: 'Bad json' }); }

    if (req.url === '/company/lookup') {
      const inn = String(data.inn || '').replace(/\D/g, '');
      if (![10, 12].includes(inn.length)) return send(res, 400, { error: 'Введите ИНН из 10 или 12 цифр' });

      try {
        const company = await lookupCompanyByInn(inn);
        if (!company) return send(res, 404, { error: 'Организация не найдена в ЕГРЮЛ/ЕГРИП' });
        return send(res, 200, { ok: true, company });
      } catch (err) {
        return send(res, 502, { error: err.message || 'Не удалось получить сведения из ЕГРЮЛ' });
      }
    }

    if (req.url === '/auth/request-code') {
      const phone = String(data.phone || '');
      if (!phone.startsWith('+') || phone.length < 8) return send(res, 400, { error: 'Введите корректный номер' });
      const db = readDb();
      const code = createAuthCode();
      const session_id = crypto.randomUUID();
      const delivery = sendAuthCodeStub({ phone, code, session_id });
      db.sessions.push({ session_id, phone, code, created_at: Date.now(), verified: false, delivery });
      writeDb(db);
      return send(res, 200, { session_id, debug_code: code, delivery, ttl: CODE_TTL_SECONDS });
    }

    if (req.url === '/auth/verify-code') {
      const db = readDb();
      const item = db.sessions.find((s) => s.session_id === data.session_id && s.phone === data.phone);
      if (!item) return send(res, 404, { error: 'Сессия не найдена' });
      if (isCodeExpired(item)) return send(res, 400, { error: 'Код истек' });
      if (String(item.code) !== String(data.code)) return send(res, 400, { error: 'Неверный код' });
      item.verified = true;
      const token = crypto.randomBytes(16).toString('hex');
      writeDb(db);
      return send(res, 200, { ok: true, token });
    }

    if (req.url === '/auth/complete-profile') {
      const db = readDb();
      const session = [...db.sessions].reverse().find((s) => s.phone === data.phone && s.verified);
      if (!session) return send(res, 400, { error: 'Телефон не подтверждён' });
      const user = { id: crypto.randomUUID(), phone: data.phone, first_name: data.first_name, last_name: data.last_name, tariff: data.tariff || null, created_at: Date.now() };
      db.users.push(user);
      const token = crypto.randomBytes(16).toString('hex');
      writeDb(db);
      return send(res, 200, { ok: true, token, user });
    }

    return send(res, 404, { error: 'Unknown endpoint' });
  });
});

server.listen(PORT, () => console.log(`Auth API started on http://localhost:${PORT}`));
