// Incremental one-way sync: local Wrangler/Miniflare D1 (SQLite, the app's primary
// store) -> remote Cloudflare D1 (an off-machine copy with point-in-time restore).
//
// Each cycle reads one consistent snapshot, diffs every row against the hashes of the
// previous successful sync, sends only changed rows (bound parameters; D1 limits SQL
// text to 100 KB but rows to 2 MB) and deletes removed rows. A new or changed table
// schema, a missing state file or a failed verification recreates that table remotely.
// The remote copy is never read by the app. Run by runner/cloud-backup.mjs.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readdir} from 'node:fs/promises';

export const SKIP = (name) => name.startsWith('sqlite_') || name.startsWith('_cf_') || name === 'd1_sync_meta';
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';
const MAX_PARAMS = 99, MAX_BYTES = 750_000;
const value = (v) => (v instanceof Uint8Array ? Array.from(v) : v);
const rowHash = (row, cols) =>
  createHash('sha256').update(JSON.stringify(cols.map((c) => (row[c] instanceof Uint8Array ? {blob: Buffer.from(row[c]).toString('base64')} : row[c])))).digest('base64url').slice(0, 22);
export const fingerprintSql = (t, cols) =>
  `SELECT count(*) AS n, coalesce(sum(${cols.map((c) => `coalesce(length(${q(c)}),0)`).join('+') || '0'}),0) AS bytes FROM ${q(t)}`;

/** One consistent snapshot of every user table: schema, columns, primary key, rows, fingerprint. */
export function readSnapshot(file) {
  const db = new DatabaseSync(file, {readOnly: true});
  try {
    db.exec('BEGIN');
    const objects = db
      .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL")
      .all()
      .filter((o) => !SKIP(o.name) && !SKIP(o.tbl_name));
    const tables = {};
    for (const o of objects.filter((o) => o.type === 'table')) {
      const info = db.prepare(`PRAGMA table_info(${q(o.name)})`).all();
      const cols = info.map((c) => c.name);
      const pk = info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
      tables[o.name] = {
        sql: o.sql,
        cols,
        pk,
        indexes: objects.filter((i) => i.type !== 'table' && i.tbl_name === o.name).map((i) => i.sql),
        rows: db.prepare(`SELECT * FROM ${q(o.name)}`).all(),
        fingerprint: db.prepare(fingerprintSql(o.name, cols)).get(),
      };
    }
    db.exec('COMMIT');
    return tables;
  } finally {
    db.close();
  }
}

/**
 * What to send for one table. `prev` is that table's state after the last successful
 * sync ({schema, rows: {key: hash}}). Tables without a primary key are recreated
 * whenever their content changes.
 */
export function planTable(table, prev) {
  const rows = {}, upserts = [], deletes = [];
  const keyed = table.pk.length > 0;
  for (const row of table.rows) {
    const h = rowHash(row, table.cols);
    rows[keyed ? JSON.stringify(table.pk.map((c) => row[c])) : h] = h;
  }
  const next = {schema: table.sql, rows};
  const changedSchema = !prev || prev.schema !== table.sql;
  if (changedSchema || (!keyed && JSON.stringify(Object.keys(rows).sort()) !== JSON.stringify(Object.keys(prev.rows).sort())))
    return {recreate: true, upserts: table.rows, deletes, next};
  for (const row of table.rows) {
    const key = JSON.stringify(table.pk.map((c) => row[c]));
    if (prev.rows[key] !== rows[key]) upserts.push(row);
  }
  for (const key of Object.keys(prev.rows)) if (!(key in rows)) deletes.push(JSON.parse(key));
  return {recreate: false, upserts, deletes, next};
}

/** Group rows into INSERT statements within D1's bound-parameter and request-size limits. */
export function batches(rows, cols) {
  const out = [];
  let batch = [], bytes = 0;
  for (const row of rows) {
    const values = cols.map((c) => value(row[c]));
    const size = values.reduce((s, v) => s + (v == null ? 4 : String(v).length), 0);
    if (batch.length && ((batch.length + 1) * cols.length > MAX_PARAMS || bytes + size > MAX_BYTES)) {
      out.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(values);
    bytes += size;
  }
  if (batch.length) out.push(batch);
  return out;
}

export function d1Client({token, account, database, fetcher = fetch}) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`;
  return async function query(sql, params = [], attempt = 1) {
    try {
      const r = await fetcher(endpoint, {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
        body: JSON.stringify({sql, params}),
        signal: AbortSignal.timeout(120_000),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body.success) {
        const msg = (body.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ') || 'HTTP ' + r.status;
        throw Object.assign(Error(msg), {retry: r.status === 429 || r.status >= 500});
      }
      return body.result?.[0]?.results || [];
    } catch (e) {
      if ((e.retry || e.name === 'TimeoutError' || e.cause) && attempt < 5) {
        await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
        return query(sql, params, attempt + 1);
      }
      throw e;
    }
  };
}

async function applyTable(query, name, table, plan) {
  if (plan.recreate) {
    await query(`DROP TABLE IF EXISTS ${q(name)}`);
    await query(table.sql);
  }
  const per = Math.max(1, Math.floor(MAX_PARAMS / table.pk.length));
  for (let i = 0; i < plan.deletes.length; i += per) {
    const chunk = plan.deletes.slice(i, i + per);
    const where = chunk.map(() => '(' + table.pk.map((c) => `${q(c)} IS ?`).join(' AND ') + ')').join(' OR ');
    await query(`DELETE FROM ${q(name)} WHERE ${where}`, chunk.flat());
  }
  const head = `INSERT OR REPLACE INTO ${q(name)} (${table.cols.map(q).join(',')}) VALUES `;
  const one = '(' + table.cols.map(() => '?').join(',') + ')';
  for (const b of batches(plan.upserts, table.cols)) await query(head + b.map(() => one).join(','), b.flat());
  if (plan.recreate) for (const sql of table.indexes) await query(sql);
}

/**
 * A backup must not follow an accidental local wipe. Two checks, both overridable:
 *  - rebuilding a table from scratch (state missing, e.g. a lost volume) never replaces
 *    a remote table with one under half its size;
 *  - a cycle is refused outright when the whole local database holds under half the rows
 *    of the last successful sync (a wiped or replaced database file).
 * Ordinary shrinking of single tables (a smaller discovery cycle) is synced normally.
 */
export const SHRINK_GUARD = {minRows: 20, keepRatio: 0.5};
const shrinks = (remoteRows, localRows) => remoteRows > SHRINK_GUARD.minRows && localRows < remoteRows * SHRINK_GUARD.keepRatio;
const remoteCount = async (query, name) => {
  const [r] = await query(`SELECT count(*) AS n FROM ${q(name)}`).catch(() => [null]);
  return Number(r?.n) || 0;
};

/** One sync cycle. Returns a summary; persists per-table state as each table succeeds. */
export async function syncOnce({source, query, loadState, saveState, database, allowShrink = false}) {
  const started = Date.now();
  const snapshot = readSnapshot(source);
  let state = await loadState();
  if (!state || state.database !== database) state = {database, tables: {}};
  const summary = {upserted: 0, deleted: 0, recreated: [], dropped: [], mismatched: [], refused: []};
  const localTotal = Object.values(snapshot).reduce((n, t) => n + t.rows.length, 0);
  if (!allowShrink && state.rowTotal && shrinks(state.rowTotal, localTotal)) {
    return {...summary, refused: ['*'], error: `Local database has ${localTotal} rows against ${state.rowTotal} at the last sync; refusing to propagate a possible wipe.`, tables: Object.keys(snapshot).length, ms: Date.now() - started};
  }
  for (const name of Object.keys(state.tables)) {
    if (snapshot[name]) continue;
    if (!allowShrink && shrinks(await remoteCount(query, name), 0)) {
      summary.refused.push(name);
      continue;
    }
    await query(`DROP TABLE IF EXISTS ${q(name)}`);
    delete state.tables[name];
    summary.dropped.push(name);
    await saveState(state);
  }
  for (const [name, table] of Object.entries(snapshot)) {
    const plan = planTable(table, state.tables[name]);
    if (!plan.recreate && !plan.upserts.length && !plan.deletes.length) continue;
    if (!allowShrink && plan.recreate && shrinks(await remoteCount(query, name), table.rows.length)) {
      summary.refused.push(name);
      continue;
    }
    await applyTable(query, name, table, plan);
    state.tables[name] = plan.next;
    await saveState(state);
    summary.upserted += plan.upserts.length;
    summary.deleted += plan.deletes.length;
    if (plan.recreate) summary.recreated.push(name);
  }
  // Verify against the same snapshot; a mismatch forgets that table's state so the
  // next cycle rebuilds it remotely. Refused tables are reported, not re-verified.
  for (const [name, table] of Object.entries(snapshot)) {
    if (summary.refused.includes(name)) continue;
    const [remote] = await query(fingerprintSql(name, table.cols)).catch(() => [null]);
    if (Number(remote?.n) !== Number(table.fingerprint.n) || Number(remote?.bytes) !== Number(table.fingerprint.bytes)) {
      summary.mismatched.push(name);
      delete state.tables[name];
    }
  }
  state.lastSyncAt = new Date().toISOString();
  if (!summary.refused.length) state.rowTotal = localTotal;
  state.lastResult = summary.refused.length ? 'refused' : summary.mismatched.length ? 'mismatch' : 'ok';
  await saveState(state);
  return {...summary, tables: Object.keys(snapshot).length, ms: Date.now() - started};
}

/** The single Miniflare D1 file in Wrangler's persistence folder. */
export async function findSource(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (files.length !== 1) throw Error(`Expected one D1 SQLite file in ${dir}, found ${files.length}.`);
  return dir + files[0];
}
