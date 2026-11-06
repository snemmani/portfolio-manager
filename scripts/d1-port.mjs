#!/usr/bin/env node
// Copy a local (Miniflare/Wrangler) D1 SQLite file into a remote Cloudflare D1 database.
//
//   node --experimental-sqlite scripts/d1-port.mjs --source <file.sqlite> --database <uuid> [--reset] [--verify-only]
//
// Credentials come from CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (never printed).
// Rows are sent as bound parameters through the D1 HTTP API, because D1 limits SQL text
// to 100 KB per statement while a row may be up to 2 MB (the largest snapshots are ~1 MB).
// --reset drops every user table in the target first, so a trial copy can be repeated.
import {DatabaseSync} from 'node:sqlite';

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? fallback : process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true;
};
const source = arg('source'), database = arg('database'), reset = !!arg('reset', false), verifyOnly = !!arg('verify-only', false);
const token = process.env.CLOUDFLARE_API_TOKEN, account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!source || !database || !token || !account) {
  console.error('Usage: --source <file.sqlite> --database <uuid> [--reset] [--verify-only]; set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.');
  process.exit(2);
}
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`;
const MAX_PARAMS = 99, MAX_BYTES = 750_000, CONCURRENCY = 4;
const SKIP = (name) => name.startsWith('sqlite_') || name.startsWith('_cf_');

async function query(sql, params = [], attempt = 1) {
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
      body: JSON.stringify({sql, params}),
      signal: AbortSignal.timeout(120_000),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.success) {
      const msg = (body.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ') || 'HTTP ' + r.status;
      // Retry rate limits and server errors; SQL errors fail immediately.
      if ((r.status === 429 || r.status >= 500) && attempt < 5) throw Object.assign(Error(msg), {retry: true});
      throw Error(msg);
    }
    return body.result?.[0]?.results || [];
  } catch (e) {
    if ((e.retry || e.name === 'TimeoutError' || e.cause) && attempt < 5) {
      await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
      return query(sql, params, attempt + 1);
    }
    throw e;
  }
}

const local = new DatabaseSync(source, {readOnly: true});
const objects = local
  .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name")
  .all()
  .filter((o) => !SKIP(o.name) && !SKIP(o.tbl_name));
const tables = objects.filter((o) => o.type === 'table').map((o) => o.name);
const q = (id) => '"' + id.replace(/"/g, '""') + '"';
const columns = (t) => local.prepare(`PRAGMA table_info(${q(t)})`).all().map((c) => c.name);
const fingerprintSql = (t, cols) =>
  `SELECT count(*) AS n, coalesce(sum(${cols.map((c) => `coalesce(length(${q(c)}),0)`).join('+')}),0) AS bytes FROM ${q(t)}`;

async function verify() {
  let ok = true;
  for (const t of tables) {
    const cols = columns(t), sql = fingerprintSql(t, cols);
    const a = local.prepare(sql).get();
    const [b] = await query(sql).catch((e) => [{n: 'missing', bytes: e.message}]);
    const same = Number(a.n) === Number(b?.n) && Number(a.bytes) === Number(b?.bytes);
    ok &&= same;
    console.log(`${same ? 'OK  ' : 'DIFF'} ${t.padEnd(24)} local ${String(a.n).padStart(5)} rows ${String(a.bytes).padStart(10)} B   remote ${String(b?.n).padStart(5)} rows ${String(b?.bytes).padStart(10)} B`);
  }
  return ok;
}

if (verifyOnly) process.exit((await verify()) ? 0 : 1);

const started = Date.now();
if (reset) {
  const existing = (await query("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name).filter((n) => !SKIP(n));
  for (const t of existing) await query(`DROP TABLE IF EXISTS ${q(t)}`);
  console.log(`Reset: dropped ${existing.length} tables in the target.`);
} else {
  const existing = (await query("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name).filter((n) => !SKIP(n));
  if (existing.length) {
    console.error(`Target already has tables (${existing.join(', ')}). Re-run with --reset to replace them.`);
    process.exit(1);
  }
}
for (const o of objects.filter((o) => o.type === 'table')) await query(o.sql);

let sent = 0;
for (const t of tables) {
  const cols = columns(t), rows = local.prepare(`SELECT * FROM ${q(t)}`).all();
  const head = `INSERT INTO ${q(t)} (${cols.map(q).join(',')}) VALUES `;
  const one = '(' + cols.map(() => '?').join(',') + ')';
  const batches = [];
  let batch = [], bytes = 0;
  for (const row of rows) {
    const values = cols.map((c) => (row[c] instanceof Uint8Array ? Array.from(row[c]) : row[c]));
    const size = values.reduce((s, v) => s + (v == null ? 4 : String(v).length), 0);
    if (batch.length && ((batch.length + 1) * cols.length > MAX_PARAMS || bytes + size > MAX_BYTES)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(values);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  let next = 0;
  await Promise.all(
    Array.from({length: Math.min(CONCURRENCY, batches.length)}, async () => {
      while (next < batches.length) {
        const b = batches[next++];
        await query(head + b.map(() => one).join(','), b.flat());
      }
    }),
  );
  sent += rows.length;
  console.log(`Copied ${t.padEnd(24)} ${String(rows.length).padStart(5)} rows in ${batches.length} requests`);
}
for (const o of objects.filter((o) => o.type !== 'table')) await query(o.sql);
console.log(`Copied ${sent} rows across ${tables.length} tables in ${((Date.now() - started) / 1000).toFixed(0)} s. Verifying…`);
process.exit((await verify()) ? 0 : 1);
