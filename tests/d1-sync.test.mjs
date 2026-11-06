import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {syncOnce, batches, planTable} from '../runner/d1-sync.mjs';

const dir = mkdtempSync(join(tmpdir(), 'd1-sync-'));
try {
  const source = join(dir, 'local.sqlite');
  const local = new DatabaseSync(source);
  local.exec(`CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);
    CREATE TABLE _cf_METADATA(key INTEGER PRIMARY KEY, value BLOB);
    CREATE TABLE candidates(id text PRIMARY KEY NOT NULL, cycle text NOT NULL, data_json text NOT NULL);
    CREATE INDEX candidates_cycle ON candidates(cycle);
    CREATE TABLE trade_reviews(id text NOT NULL, kind text NOT NULL, fingerprint text NOT NULL, PRIMARY KEY(id, kind));
    INSERT INTO d1_migrations(name) VALUES ('0001_init'),('0002_more');
    INSERT INTO _cf_METADATA VALUES (1, x'00');
    INSERT INTO candidates VALUES ('a','c1','{"p":1}'),('b','c1','{"p":2}'),('c','c1','{"p":3}');
    INSERT INTO trade_reviews VALUES ('x','profit','f1'),('x','reentry','f2');`);

  // The "remote" D1 is another SQLite database driven through the same query interface.
  const remote = new DatabaseSync(':memory:');
  let writes = 0;
  const query = async (sql, params = []) => {
    const st = remote.prepare(sql);
    if (/^\s*select/i.test(sql)) return st.all(...params);
    writes++;
    st.run(...params);
    return [];
  };
  let state = null;
  const io = {source, query, database: 'db-1', loadState: async () => (state ? JSON.parse(JSON.stringify(state)) : null), saveState: async (s) => { state = JSON.parse(JSON.stringify(s)); }};
  const rows = (db, t) => db.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all();
  const same = (t) => assert.deepEqual(rows(remote, t), rows(local, t), `${t} matches the local table`);

  let r = await syncOnce(io);
  assert.deepEqual(r.recreated.sort(), ['candidates', 'd1_migrations', 'trade_reviews'], 'A first sync recreates every user table');
  assert.equal(r.mismatched.length, 0, 'A first sync verifies cleanly');
  for (const t of ['candidates', 'd1_migrations', 'trade_reviews']) same(t);
  assert.equal(remote.prepare("SELECT count(*) n FROM sqlite_master WHERE name='_cf_METADATA'").get().n, 0, 'Internal Cloudflare tables are never copied');
  assert.equal(remote.prepare("SELECT count(*) n FROM sqlite_master WHERE name='candidates_cycle'").get().n, 1, 'Indexes are recreated');

  writes = 0;
  r = await syncOnce(io);
  assert.equal(r.upserted + r.deleted + r.recreated.length, 0, 'An unchanged database sends nothing');
  assert.equal(writes, 0, 'An unchanged database writes nothing remotely');

  local.exec(`UPDATE candidates SET data_json='{"p":20}' WHERE id='b'; INSERT INTO candidates VALUES ('d','c2','{"p":4}'); DELETE FROM candidates WHERE id='a';
    UPDATE trade_reviews SET fingerprint='f3' WHERE id='x' AND kind='reentry'; DELETE FROM trade_reviews WHERE kind='profit';`);
  r = await syncOnce(io);
  assert.equal(r.upserted, 3, 'Only changed and new rows are sent (2 candidates, 1 review)');
  assert.equal(r.deleted, 2, 'Removed rows are deleted remotely, including composite keys');
  assert.deepEqual(r.recreated, [], 'Row changes do not rebuild tables');
  same('candidates');
  same('trade_reviews');

  local.exec(`CREATE TABLE fresh(id text PRIMARY KEY, v text); INSERT INTO fresh VALUES ('1','one'); DROP TABLE trade_reviews;`);
  r = await syncOnce(io);
  assert.deepEqual(r.recreated, ['fresh'], 'A new local table (a migration) is created remotely');
  assert.deepEqual(r.dropped, ['trade_reviews'], 'A table dropped locally is dropped remotely');
  same('fresh');

  remote.exec("DELETE FROM candidates WHERE id='d'");
  r = await syncOnce(io);
  assert.deepEqual(r.mismatched, ['candidates'], 'Remote drift is detected by verification');
  r = await syncOnce(io);
  assert.deepEqual(r.recreated, ['candidates'], 'A table that failed verification is rebuilt on the next cycle');
  same('candidates');

  state.database = 'other';
  r = await syncOnce({...io, database: 'db-1'});
  assert.equal(r.recreated.length, 3, 'State from a different database is discarded and everything is rebuilt');

  // Anti-wipe: a lost state file (lost volume) plus an emptied table must not wipe the backup.
  local.exec("CREATE TABLE ledger(id text PRIMARY KEY, v text)");
  for (let i = 0; i < 30; i++) local.prepare('INSERT INTO ledger VALUES (?, ?)').run(String(i), 'v' + i);
  r = await syncOnce(io);
  same('ledger');
  local.exec("DELETE FROM ledger WHERE CAST(id AS integer) >= 5");
  state = null;
  r = await syncOnce(io);
  assert.ok(r.refused.includes('ledger'), 'Rebuilding a table from scratch never shrinks the remote copy below half');
  assert.equal(remote.prepare('SELECT count(*) n FROM ledger').get().n, 30, 'The backup keeps its rows');
  r = await syncOnce({...io, allowShrink: true});
  assert.equal(remote.prepare('SELECT count(*) n FROM ledger').get().n, 5, 'An explicit override applies the shrink');
  local.exec("DELETE FROM ledger WHERE id <> '0'");
  r = await syncOnce(io);
  assert.equal(r.deleted, 4, 'An ordinary single-table shrink is synced normally');
  for (let i = 1; i < 60; i++) local.prepare('INSERT INTO ledger VALUES (?, ?)').run('n' + i, 'v');
  r = await syncOnce(io);
  local.exec('DELETE FROM ledger; DELETE FROM candidates; DELETE FROM fresh;');
  r = await syncOnce(io);
  assert.deepEqual(r.refused, ['*'], 'A cycle is refused when the whole database has lost most of its rows');
  assert.equal(remote.prepare('SELECT count(*) n FROM ledger').get().n, 60, 'A wiped local database does not wipe the backup');

  const big = 'x'.repeat(600_000);
  const b = batches([{id: '1', v: big}, {id: '2', v: big}, {id: '3', v: 's'}], ['id', 'v']);
  assert.equal(b.length, 2, 'Large rows are split so each request stays within the size budget');
  assert.equal(batches(Array.from({length: 120}, (_, i) => ({id: String(i), v: 'v'})), ['id', 'v']).length, 3, 'Batches stay within 99 bound parameters');
  assert.equal(planTable({sql: 's', cols: ['v'], pk: [], rows: [{v: 1}]}, {schema: 's', rows: {}}).recreate, true, 'A changed table without a primary key is recreated');

  local.close();
  remote.close();
  console.log('PASS: D1 sync copies only changed rows, deletes removed rows (composite keys), skips internal tables, follows migrations and dropped tables, detects remote drift and rebuilds, refuses to propagate a local wipe, and respects D1 parameter and size limits.');
} finally {
  rmSync(dir, {recursive: true, force: true});
}
