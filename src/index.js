/* =========================================================================
   RAR Predictor: shared-data API (Cloudflare Worker + Durable Object)

   The static site in /public is served as-is. Requests to /api/* run this
   Worker, which keeps one shared copy of the team's data in a SQLite-backed
   Durable Object so every device sees the same days.

   Auth: POST /api/login with the password returns a token (an HMAC derived
   from the password). Every other /api route needs "Authorization: Bearer
   <token>". Changing the password (the APP_PASSWORD secret) signs everyone out.

   Routes
     GET  /api/health             -> { ok: true }                    (no auth)
     POST /api/login  {password}  -> { token } | 401                 (no auth)
     GET  /api/data?v=<version>   -> { version, days, preds } | { version, unchanged: true }
     POST /api/sync   { days: { date: entry|null }, preds: { date: pred|null } } -> { version }
   ========================================================================= */
import { DurableObject } from 'cloudflare:workers';

const DEFAULT_PASSWORD = 'rar';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ENTRY = 20000;        // bytes per stored day
const MAX_CHANGES = 2000;       // dates per sync request

export class TeamStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS preds (date TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }

  version() {
    const row = this.sql.exec("SELECT value FROM meta WHERE key = 'version'").toArray()[0];
    return row ? Number(row.value) : 0;
  }

  read(since) {
    const version = this.version();
    if (since != null && Number(since) === version) return { version, unchanged: true };
    const days = {}, preds = {};
    for (const r of this.sql.exec('SELECT date, data FROM days')) days[r.date] = JSON.parse(r.data);
    for (const r of this.sql.exec('SELECT date, data FROM preds')) preds[r.date] = JSON.parse(r.data);
    return { version, days, preds };
  }

  write(changes) {
    const now = Date.now();
    let n = 0;
    for (const [table, items] of [['days', changes.days || {}], ['preds', changes.preds || {}]]) {
      for (const [date, value] of Object.entries(items)) {
        if (value === null) this.sql.exec(`DELETE FROM ${table} WHERE date = ?`, date);
        else this.sql.exec(`INSERT INTO ${table} (date, data, updated) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET data = excluded.data, updated = excluded.updated`, date, JSON.stringify(value), now);
        n++;
      }
    }
    let version = this.version();
    if (n) {
      version++;
      this.sql.exec("INSERT INTO meta (key, value) VALUES ('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(version));
    }
    return { version };
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

async function tokenFor(password) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('rar-predictor-session-v1'));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function same(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.byteLength !== y.byteLength) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}

function validChanges(body) {
  if (!body || typeof body !== 'object') return 'Body must be a JSON object';
  let count = 0;
  for (const key of ['days', 'preds']) {
    const items = body[key];
    if (items == null) continue;
    if (typeof items !== 'object' || Array.isArray(items)) return `"${key}" must be an object`;
    for (const [date, value] of Object.entries(items)) {
      if (!DATE.test(date)) return `Bad date "${date}"`;
      if (value !== null && (typeof value !== 'object' || Array.isArray(value))) return `Entry for ${date} must be an object or null`;
      if (value !== null && JSON.stringify(value).length > MAX_ENTRY) return `Entry for ${date} is too large`;
      count++;
    }
  }
  if (count > MAX_CHANGES) return `Too many changes in one request (max ${MAX_CHANGES})`;
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const password = env.APP_PASSWORD || DEFAULT_PASSWORD;
    const route = request.method + ' ' + url.pathname;

    if (route === 'GET /api/health') return json({ ok: true, shared: true });

    if (route === 'POST /api/login') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      if (typeof body.password === 'string' && same(body.password, password)) return json({ token: await tokenFor(password) });
      await new Promise((r) => setTimeout(r, 600)); // slow down guessing
      return json({ error: 'Wrong password' }, 401);
    }

    const auth = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || !same(token, await tokenFor(password))) return json({ error: 'Not signed in' }, 401);

    const store = env.TEAM_STORE.get(env.TEAM_STORE.idFromName('rar-team'));

    if (route === 'GET /api/data') return json(await store.read(url.searchParams.get('v')));

    if (route === 'POST /api/sync') {
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
      const problem = validChanges(body);
      if (problem) return json({ error: problem }, 400);
      return json(await store.write({ days: body.days, preds: body.preds }));
    }

    return json({ error: 'Not found' }, 404);
  }
};
